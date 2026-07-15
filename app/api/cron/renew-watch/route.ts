import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { googleApiFetch } from '../../../../lib/google-calendar'
import { isReauthError } from '../../../../lib/google-errors'
import { v4 as uuidv4 } from 'uuid'

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // googleApiFetch : refresh forcé + retry sur 401 — un token capricieux au
    // moment du renouvellement (tous les 5 jours) ne doit pas tuer le canal
    // en silence, sinon retour à la sync horaire sans que personne ne le voie.
    // Stop ALL known watches (même logique que /api/calendar/watch)
    const oldWatches = await prisma.googleCalendarWatch.findMany()
    for (const old of oldWatches) {
      try {
        await googleApiFetch(
          'https://www.googleapis.com/calendar/v3/channels/stop',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: old.channelId,
              resourceId: old.resourceId,
            }),
          }
        )
      } catch {
        // Ignore errors stopping old watch
      }
    }
    await prisma.googleCalendarWatch.deleteMany()

    // Create new watch
    const channelId = uuidv4()

    const res = await googleApiFetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/webhook`,
          token: process.env.GOOGLE_WEBHOOK_SECRET,
          expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
      }
    )

    const watch = await res.json()
    if (!res.ok) {
      console.error('[Cron renew-watch] Google error:', watch)
      return NextResponse.json({ error: watch }, { status: 400 })
    }

    await prisma.googleCalendarWatch.upsert({
      where: { channelId },
      create: {
        channelId,
        resourceId: watch.resourceId,
        expiration: new Date(parseInt(watch.expiration)),
      },
      update: {
        resourceId: watch.resourceId,
        expiration: new Date(parseInt(watch.expiration)),
        renewedAt: new Date(),
      },
    })

    console.log(`[Cron renew-watch] Webhook renewed, expires: ${new Date(parseInt(watch.expiration)).toISOString()}`)

    return NextResponse.json({
      success: true,
      channelId,
      expiration: new Date(parseInt(watch.expiration)).toISOString(),
    })
  } catch (error: unknown) {
    // Reauth requise (token révoqué/expiré côté Google) → skip proprement.
    // Retourner 200 pour éviter le spam d'erreurs 500 dans les logs Vercel
    // jusqu'à reconnexion manuelle depuis /admin/settings.
    if (isReauthError(error)) {
      console.warn(
        '[Cron renew-watch] Skipped — Google reauth required:',
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

    console.error('[Cron renew-watch] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Renew watch error' },
      { status: 500 }
    )
  }
}
