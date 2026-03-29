import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { pullFromGoogle } from '../../../../lib/sync-engine'
import { fetchChangedEvents } from '../../../../lib/google-calendar'

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
    console.error('[Cron sync] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync error' },
      { status: 500 }
    )
  }
}
