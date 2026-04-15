import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { pullFromGoogle } from '../../../../lib/sync-engine'
import { fetchChangedEvents } from '../../../../lib/google-calendar'
import { isReauthError } from '../../../../lib/google-errors'

export const dynamic = 'force-dynamic'

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

    if (finalSyncToken) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: { syncToken: finalSyncToken },
      })
    }

    console.log(`[Cron sync] Processing ${events.length} events...`)

    const results: Array<{ eventId: string; action: string }> = []

    // Process sequentially to avoid connection pool issues
    for (const event of events) {
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
    }

    const imported = results.filter(
      (r) => r.action === 'booking_created' || r.action === 'block_created'
    ).length
    const errors = results.filter((r) => r.action.startsWith('error')).length

    console.log(
      `[Cron sync] Done: ${events.length} events, ${imported} imported, ${errors} errors`
    )

    return NextResponse.json({
      success: true,
      processed: events.length,
      imported,
      errors,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync error' },
      { status: 500 }
    )
  }
}
