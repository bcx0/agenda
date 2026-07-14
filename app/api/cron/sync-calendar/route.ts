import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { pullFromGoogle, repushUnsyncedBookings } from '../../../../lib/sync-engine'
import { fetchChangedEvents } from '../../../../lib/google-calendar'
import { isReauthError } from '../../../../lib/google-errors'

export const dynamic = 'force-dynamic'
// Les runs post-purge traitent des centaines d'événements et dépassaient la
// limite par défaut (504 FUNCTION_INVOCATION_TIMEOUT, cf. logs Vercel).
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const token = await prisma.googleToken.findFirst()
    if (!token) {
      return NextResponse.json({ error: 'No Google token' }, { status: 401 })
    }

    const { items, nextSyncToken, fullSyncRequired } = await fetchChangedEvents(
      token.syncToken
    )

    let events = items
    let finalSyncToken = nextSyncToken

    if (fullSyncRequired) {
      const fullSync = await fetchChangedEvents(null)
      events = fullSync.items
      finalSyncToken = fullSync.nextSyncToken
    }

    console.log(`[Cron sync] Processing ${events.length} events...`)

    const results: Array<{ eventId: string; action: string }> = []

    // Traitement par lots de 5 en parallèle : le tout-séquentiel ne tenait
    // pas dans maxDuration=300s sur une full sync (~800+ événements quand
    // syncToken est null) → la fonction mourait en 504 AVANT de sauver le
    // syncToken et le heartbeat, et la full sync repartait à chaque run.
    // 5 reste sous la limite du pool de connexions Prisma.
    const CONCURRENCY = 5
    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const chunk = events.slice(i, i + CONCURRENCY)
      await Promise.all(
        chunk.map(async (event) => {
          try {
            const result = await pullFromGoogle(
              event.status === 'cancelled' ? null : event,
              event.id
            )
            results.push({ eventId: event.id, action: result.action })
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[Cron sync] Error processing event ${event.id}:`, message)
            results.push({ eventId: event.id, action: `error: ${message}` })
          }
        })
      )
    }

    // Persiste le syncToken APRÈS le traitement (même logique que le webhook) :
    // si la fonction meurt en plein milieu (timeout), l'ancien token est
    // conservé et le prochain run re-fetche les événements manqués
    // (pullFromGoogle est idempotent). L'ancien ordre — token sauvé AVANT le
    // traitement — perdait des événements à chaque 504.
    if (finalSyncToken) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: { syncToken: finalSyncToken },
      })
    }

    const imported = results.filter(
      (r) => r.action === 'booking_created' || r.action === 'block_created'
    ).length
    const errors = results.filter((r) => r.action.startsWith('error')).length

    // Auto-guérison : repousse vers Google les RDV créés dans l'app qui
    // n'ont jamais été synchronisés (ex. pendant une panne d'auth).
    let repushed = { pushed: 0, failed: 0 }
    try {
      repushed = await repushUnsyncedBookings()
    } catch (err) {
      console.error('[Cron sync] Repush failed:', err instanceof Error ? err.message : err)
    }

    console.log(
      `[Cron sync] Done: ${events.length} events, ${imported} imported, ${errors} errors, ${repushed.pushed} repushed`
    )

    // Heartbeat : trace le succès du cron même sans événement à traiter.
    // Sans ça, une sync réussie "vide" n'écrit rien en SyncLog et le badge
    // "Reconnexion requise" (lib/google-health.ts) reste bloqué sur la
    // dernière auth_error. Fire-and-forget.
    await prisma.syncLog
      .create({
        data: {
          table: 'GoogleToken',
          action: 'sync_ok',
          direction: 'google_to_app',
          details: { processed: events.length, repushed: repushed.pushed },
        },
      })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      processed: events.length,
      imported,
      errors,
      repushed: repushed.pushed,
      repushFailed: repushed.failed,
    })
  } catch (error: unknown) {
    // Reauth requise (token révoqué/expiré côté Google) → on skip proprement.
    // Retourner 200 pour éviter le spam d'erreurs 500 dans les logs Vercel
    // toutes les heures jusqu'à reconnexion manuelle.
    if (isReauthError(error)) {
      console.warn(
        '[Cron sync] Skipped — Google reauth required:',
        error.message
      )
      return NextResponse.json(
        {
          success: false,
          skipped: 'reauth_required',
          message:
            'Google Calendar doit être reconnecté depuis /admin/settings.',
        },
        { status: 200 }
      )
    }

    console.error('[Cron sync] Error:', error)

    // Trace l'échec en SyncLog : sans ça, un run qui plante hors-auth est
    // totalement invisible en base (seuls les logs Vercel le voient).
    await prisma.syncLog
      .create({
        data: {
          table: 'GoogleToken',
          action: 'sync_error',
          direction: 'google_to_app',
          details: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      })
      .catch(() => {})

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync error' },
      { status: 500 }
    )
  }
}
