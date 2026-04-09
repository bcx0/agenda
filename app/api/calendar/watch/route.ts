import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken } from '@/lib/google-calendar'
import { v4 as uuidv4 } from 'uuid'

export async function POST() {
    try {
          const accessToken = await getValidAccessToken()

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
