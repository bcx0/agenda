import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/google-calendar'
import { getAdminSession } from '@/lib/session'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
    // Réservé au cron (Bearer CRON_SECRET) ou à l'admin connecté :
    // sinon n'importe qui pouvait ré-enregistrer le webhook Google.
    const authHeader = request.headers.get('authorization')
    const isCron =
      !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
    if (!isCron && !getAdminSession()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
          const accessToken = await getValidAccessToken()

      // Stoppe TOUS les canaux connus avant d'en créer un nouveau : sans ça,
      // chaque reconnexion empilait un canal de plus (8 canaux actifs le
      // 14/07 → 8 notifications et 8 syncs par événement Google).
      const oldWatches = await prisma.googleCalendarWatch.findMany()
      for (const old of oldWatches) {
        try {
          await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: old.channelId,
              resourceId: old.resourceId,
            }),
          })
        } catch {
          // Canal déjà expiré/inconnu — on ignore.
        }
      }
      await prisma.googleCalendarWatch.deleteMany()

      const channelId = uuidv4()

      const res = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
        {
                  method: 'POST',
                  headers: {
                              Authorization: `Bearer ${accessToken}`,
                              'Content-Type': 'application/json',
                  },
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

      return NextResponse.json({ success: true })
    } catch (error) {
          console.error('[Watch] Erreur enregistrement webhook:', error)
          return NextResponse.json({ error: 'Watch registration failed' }, { status: 500 })
    }
}
