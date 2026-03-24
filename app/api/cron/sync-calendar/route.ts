import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { pullFromGoogle } from '../../../../lib/sync-engine'
import { fetchChangedEvents } from '../../../../lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret
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

    const results: Array<{ eventId: string; action: string }> = []

    for (const event of events) {
      try {
        const result = await pullFromGoogle(
          event.status === 'cancelled' ? null : event,
          event.id
        )
        results.push({ eventId: event.id, action: result.action })
      } catch (err: any) {
        console.error(`[Cron sync] Error processing event ${event.id}:`, err)
        results.push({ eventId: event.id, action: `error: ${err.message}` })
      }
    }

    console.log(`[Cron sync] Processed ${events.length} events:`, JSON.stringify(results))

    return NextResponse.json({
      success: true,
      processed: events.length,
      results,
    })
  } catch (error: any) {
    console.error('[Cron sync] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
