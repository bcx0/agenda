import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { fetchChangedEvents } from '../../../../lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const token = await prisma.googleToken.findFirst()
    if (!token) {
      return NextResponse.json({ error: 'No Google token found' }, { status: 401 })
    }

    // Check watch status
    const watch = await prisma.googleCalendarWatch.findFirst({
      orderBy: { createdAt: 'desc' },
    })

    // Check recent sync logs
    const recentLogs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Check recent bookings with google sync
    const recentGoogleBookings = await prisma.booking.findMany({
      where: { googleEventId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { client: { select: { name: true } } },
    })

    // Check recent blocks with google sync
    const recentGoogleBlocks = await prisma.block.findMany({
      where: { googleEventId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Try fetching changed events from Google
    let changedEvents = null
    let fetchError = null
    try {
      changedEvents = await fetchChangedEvents(token.syncToken)
    } catch (err: any) {
      fetchError = err.message
    }

    return NextResponse.json({
      googleToken: {
        id: token.id,
        hasSyncToken: !!token.syncToken,
        syncTokenPrefix: token.syncToken ? token.syncToken.substring(0, 30) + '...' : null,
        tokenExpiresAt: token.expiresAt,
      },
      watch: watch ? {
        channelId: watch.channelId,
        resourceId: watch.resourceId,
        expiration: watch.expiration,
        isExpired: watch.expiration < new Date(),
        createdAt: watch.createdAt,
      } : null,
      changedEvents: changedEvents ? {
        count: changedEvents.items.length,
        fullSyncRequired: changedEvents.fullSyncRequired,
        items: changedEvents.items.map((e: any) => ({
          id: e.id,
          summary: e.summary,
          status: e.status,
          start: e.start,
          end: e.end,
          updated: e.updated,
          appSource: e.extendedProperties?.private?.appSource,
        })),
      } : { error: fetchError },
      recentSyncLogs: recentLogs.map(l => ({
        table: l.table,
        recordId: l.recordId,
        action: l.action,
        direction: l.direction,
        createdAt: l.createdAt,
        details: l.details,
      })),
      syncedBookings: recentGoogleBookings.map(b => ({
        id: b.id,
        client: b.client.name,
        startAt: b.startAt,
        status: b.status,
        googleEventId: b.googleEventId,
        syncStatus: b.syncStatus,
        syncSource: b.syncSource,
        lastSyncedAt: b.lastSyncedAt,
      })),
      syncedBlocks: recentGoogleBlocks.map(b => ({
        id: b.id,
        reason: b.reason,
        startAt: b.startAt,
        endAt: b.endAt,
        googleEventId: b.googleEventId,
        syncStatus: b.syncStatus,
        syncSource: b.syncSource,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 })
  }
}
