import { PrismaClient } from '@prisma/client'
import * as crypto from 'crypto'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarEvent,
} from './google-calendar'
import { parseGoogleEventSummary } from './parse-google-event'

const prisma = new PrismaClient()
const APP_SOURCE_TAG = 'your-saas-app'
const DEFAULT_TIMEZONE = 'Europe/Paris'

async function findOrCreateGoogleClient(clientName: string) {
  const normalizedName = clientName.trim().replace(/\s+/g, ' ')
  const normalizedLower = normalizedName.toLowerCase()

  const realClients = await prisma.client.findMany({
    where: {
      isActive: true,
      NOT: { email: { endsWith: '@import.local' } },
    },
    select: { id: true, name: true, email: true, passwordHash: true, creditsPerMonth: true, isActive: true, createdAt: true },
  })

  const exactRealMatch = realClients.find(
    (c) => c.name.toLowerCase() === normalizedLower
  )
  if (exactRealMatch) return exactRealMatch

  const partialMatch = realClients.find((c) => {
    const cLower = c.name.toLowerCase()
    return cLower.includes(normalizedLower) || normalizedLower.includes(cLower)
  })
  if (partialMatch) return partialMatch

  const exactAnyMatch = await prisma.client.findFirst({
    where: { name: { equals: normalizedName, mode: 'insensitive' } },
  })
  if (exactAnyMatch) return exactAnyMatch

  const safeSlug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
    .replace(/^-+/g, '')
  const email = `google-${safeSlug || 'client'}-${Date.now()}@import.local`

  return prisma.$transaction(async (tx) => {
    const realCheck = await tx.client.findMany({
      where: {
        isActive: true,
        NOT: { email: { endsWith: '@import.local' } },
      },
    })
    const lastChance = realCheck.find((c) => {
      const cLower = c.name.toLowerCase()
      return cLower === normalizedLower || cLower.includes(normalizedLower) || normalizedLower.includes(cLower)
    })
    if (lastChance) return lastChance

    const anyCheck = await tx.client.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
    })
    if (anyCheck) return anyCheck

    return tx.client.create({
      data: {
        name: normalizedName,
        email,
        passwordHash: crypto.randomBytes(16).toString('hex'),
        creditsPerMonth: 0,
        isActive: true,
      },
    })
  })
}

export async function pushBookingToGoogle(
  bookingId: number,
  action: 'create' | 'update' | 'delete'
): Promise<{ skipped: boolean } | { success: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { client: true },
  })
  if (!booking) throw new Error(`Booking ${bookingId} introuvable`)

  if (booking.syncSource === 'google' && action !== 'delete') {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        syncSource: 'app',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    })
    return { skipped: true }
  }

  const payload = {
    summary: `RDV \u2014 ${booking.client.name}`,
    description: `Mode : ${booking.mode}\nClient : ${booking.client.email}`,
    start: {
      dateTime: booking.startAt.toISOString(),
      timeZone: booking.timeZone ?? DEFAULT_TIMEZONE,
    },
    end: {
      dateTime: booking.endAt.toISOString(),
      timeZone: booking.timeZone ?? DEFAULT_TIMEZONE,
    },
    extendedProperties: {
      private: {
        appSource: APP_SOURCE_TAG,
        recordType: 'booking',
        recordId: String(bookingId),
      },
    },
  }

  try {
    if (action === 'delete' && booking.googleEventId) {
      await deleteGoogleEvent(booking.googleEventId)
      await prisma.booking.update({
        where: { id: bookingId },
        data: { syncStatus: 'cancelled' },
      })
    } else if (action === 'create' || !booking.googleEventId) {
      const created = await createGoogleEvent(payload)
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          googleEventId: created.id,
          googleEtag: created.etag,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    } else if (action === 'update' && booking.googleEventId) {
      const updated = await updateGoogleEvent(booking.googleEventId, payload)
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          googleEtag: updated.etag,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    }

    await logSync('Booking', bookingId, `push_${action}`, 'app_to_google')
    return { success: true }
  } catch (error) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { syncStatus: 'error' },
    })
    await logSync('Booking', bookingId, 'error', 'app_to_google', {
      error: String(error),
    })
    throw error
  }
}

export async function pushBlockToGoogle(
  blockId: number,
  action: 'create' | 'update' | 'delete'
): Promise<{ skipped: boolean } | { success: boolean }> {
  const block = await prisma.block.findUnique({ where: { id: blockId } })
  if (!block) throw new Error(`Block ${blockId} introuvable`)

  if (block.syncSource === 'google') {
    await prisma.block.update({
      where: { id: blockId },
      data: {
        syncSource: 'app',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    })
    return { skipped: true }
  }

  const payload = {
    summary: block.reason ? `Indisponible \u2014 ${block.reason}` : 'Indisponible',
    start: {
      dateTime: block.startAt.toISOString(),
      timeZone: DEFAULT_TIMEZONE,
    },
    end: {
      dateTime: block.endAt.toISOString(),
      timeZone: DEFAULT_TIMEZONE,
    },
    extendedProperties: {
      private: {
        appSource: APP_SOURCE_TAG,
        recordType: 'block',
        recordId: String(blockId),
      },
    },
  }

  try {
    if (action === 'delete' && block.googleEventId) {
      await deleteGoogleEvent(block.googleEventId)
      await prisma.block.update({
        where: { id: blockId },
        data: { syncStatus: 'cancelled' },
      })
    } else if (action === 'create' || !block.googleEventId) {
      const created = await createGoogleEvent(payload)
      await prisma.block.update({
        where: { id: blockId },
        data: {
          googleEventId: created.id,
          googleEtag: created.etag,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    } else if (action === 'update' && block.googleEventId) {
      const updated = await updateGoogleEvent(block.googleEventId, payload)
      await prisma.block.update({
        where: { id: blockId },
        data: {
          googleEtag: updated.etag,
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    }

    await logSync('Block', blockId, `push_${action}`, 'app_to_google')
    return { success: true }
  } catch (error) {
    await prisma.block.update({
      where: { id: blockId },
      data: { syncStatus: 'error' },
    })
    await logSync('Block', blockId, 'error', 'app_to_google', {
      error: String(error),
    })
    throw error
  }
}

export async function pullFromGoogle(
  googleEvent: GoogleCalendarEvent | null,
  googleEventId: string
): Promise<{ action: string; [key: string]: any }> {
  if (!googleEvent || googleEvent.status === 'cancelled') {
    const booking = await prisma.booking.findFirst({
      where: { googleEventId },
    })
    if (booking) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          syncStatus: 'cancelled',
          syncSource: 'google',
          lastSyncedAt: new Date(),
          cancelReason: 'Supprim\u00e9 depuis Google Calendar',
        },
      })
      await logSync('Booking', booking.id, 'pull_delete', 'google_to_app')
      return { action: 'booking_cancelled' }
    }

    const block = await prisma.block.findFirst({
      where: { googleEventId },
    })
    if (block) {
      await prisma.block.delete({ where: { id: block.id } })
      await logSync('Block', block.id, 'pull_delete', 'google_to_app')
      return { action: 'block_deleted' }
    }

    return { action: 'not_found' }
  }

  const appSource = googleEvent.extendedProperties?.private?.appSource
  const recordType = googleEvent.extendedProperties?.private?.recordType
  const recordId = googleEvent.extendedProperties?.private?.recordId

  if (appSource === APP_SOURCE_TAG && recordId) {
    if (recordType === 'booking') {
      await prisma.booking.update({
        where: { id: parseInt(recordId) },
        data: { googleEtag: googleEvent.etag },
      })
    }
    if (recordType === 'block') {
      await prisma.block.update({
        where: { id: parseInt(recordId) },
        data: { googleEtag: googleEvent.etag },
      })
    }
    return { action: 'etag_updated', skipped: true }
  }

  const existingBooking = await prisma.booking.findFirst({
    where: { googleEventId },
  })

  if (existingBooking) {
    const appTime = existingBooking.updatedAt.getTime()
    const googleTime = new Date(googleEvent.updated).getTime()

    if (appTime > googleTime) {
      await pushBookingToGoogle(existingBooking.id, 'update')
      await logSync('Booking', existingBooking.id, 'conflict', 'app_to_google', {
        winner: 'app',
      })
      return { action: 'conflict_app_wins' }
    } else {
      await prisma.booking.update({
        where: { id: existingBooking.id },
        data: {
          startAt: new Date(googleEvent.start.dateTime!),
          endAt: new Date(googleEvent.end.dateTime!),
          googleEtag: googleEvent.etag,
          syncSource: 'google',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
      await logSync('Booking', existingBooking.id, 'pull_update', 'google_to_app')
      return { action: 'booking_updated' }
    }
  }

  // \u2500\u2500 FIX: v\u00e9rifier s'il existe d\u00e9j\u00e0 un Block avec ce googleEventId \u2500\u2500
  const existingBlock = await prisma.block.findFirst({
    where: { googleEventId },
  })

  if (existingBlock) {
    if (googleEvent.start.dateTime) {
      await prisma.block.update({
        where: { id: existingBlock.id },
        data: {
          startAt: new Date(googleEvent.start.dateTime),
          endAt: new Date(googleEvent.end.dateTime!),
          reason: googleEvent.summary || existingBlock.reason,
          googleEtag: googleEvent.etag,
          syncSource: 'google',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
      await logSync('Block', existingBlock.id, 'pull_update', 'google_to_app')
      return { action: 'block_updated', id: existingBlock.id }
    }
    return { action: 'block_exists_skipped', id: existingBlock.id }
  }

  if (!googleEvent.start.dateTime) {
    return { action: 'skipped_all_day' }
  }

  const parsed = parseGoogleEventSummary(googleEvent.summary)

  if (parsed.type === 'booking') {
    const client = await findOrCreateGoogleClient(parsed.clientName || 'Client Google')

    const newBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        startAt: new Date(googleEvent.start.dateTime),
        endAt: new Date(googleEvent.end.dateTime!),
        status: 'CONFIRMED',
        mode: 'VISIO',
        googleEventId,
        syncSource: 'google',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        bookedBy: 'google',
      },
    })

    await logSync('Booking', newBooking.id, 'pull_create', 'google_to_app', {
      source: 'google_external_event',
      summary: googleEvent.summary,
      parsedType: parsed.type,
      parsedClientName: parsed.clientName,
    })

    return { action: 'booking_created', id: newBooking.id, clientName: parsed.clientName }
  }

  const newBlock = await prisma.block.create({
    data: {
      startAt: new Date(googleEvent.start.dateTime),
      endAt: new Date(googleEvent.end.dateTime!),
      reason: parsed.reason,
      googleEventId,
      syncSource: 'google',
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
      createdAt: new Date(),
    },
  })

  await logSync('Block', newBlock.id, 'pull_create', 'google_to_app', {
    source: 'google_external_event',
    summary: googleEvent.summary,
  })
  return { action: 'block_created', id: newBlock.id, type: parsed.type }
}

async function logSync(
  table: string,
  recordId: number | undefined,
  action: string,
  direction: string,
  details?: object
): Promise<void> {
  await prisma.syncLog.create({
    data: {
      table,
      recordId: recordId ?? null,
      action,
      direction,
      details: details ?? {},
    },
  })
}
