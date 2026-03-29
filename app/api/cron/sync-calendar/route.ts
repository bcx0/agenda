import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { pullFromGoogle } from '../../../../lib/sync-engine'
import { fetchChangedEvents } from '../../../../lib/google-calendar'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

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

    console.log(`[Cron sync] Processing ${events.length} events...`)

    const results: Array<{ eventId: string; action: string }> = []

    // Process in batches of 10 for better performance
    for (let i = 0; i < events.length; i += 10) {
      const batch = events.slice(i, i + 10)
      const batchResults = await Promise.allSettled(
        batch.map(async (event) => {
          const result = await pullFromGoogle(
            event.status === 'cancelled' ? null : event,
            event.id
          )
          return { eventId: event.id, action: result.action }
        })
      )

      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value)
        } else {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
          console.error(`[Cron sync] Batch error:`, reason)
          results.push({ eventId: 'unknown', action: `error: ${reason}` })
        }
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
