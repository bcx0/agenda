import * as crypto from 'crypto'
import { prisma } from './prisma'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarEvent,
} from './google-calendar'
import { parseGoogleEventSummary } from './parse-google-event'
import { matchClientNameIndex } from './fuzzy-match'

const APP_SOURCE_TAG = 'your-saas-app'
const DEFAULT_TIMEZONE = 'Europe/Paris'

// Événements Google importés au-delà de cet horizon = ignorés.
// Évite qu'une récurrence infinie inonde la base (bug "RDV en 2031") :
// l'agenda public ne montre de toute façon que 365 jours.
const MAX_IMPORT_HORIZON_DAYS = 400
const NO_ACCOUNT_PREFIX = '[NO_ACCOUNT] RDV — '

function isBeyondImportHorizon(start: Date): boolean {
  return start.getTime() > Date.now() + MAX_IMPORT_HORIZON_DAYS * 24 * 60 * 60 * 1000
}

/** Nom client stocké dans la raison d'un bloc [NO_ACCOUNT]. */
function noAccountBlockName(reason: string | null): string | null {
  if (!reason || !reason.startsWith(NO_ACCOUNT_PREFIX)) return null
  return reason.slice(NO_ACCOUNT_PREFIX.length).replace(' (non trouvé)', '').trim() || null
}

// ─── Client cache for batch sync (avoids repeated DB queries) ────
type CachedClient = {
  id: number; name: string; email: string;
  passwordHash: string; creditsPerMonth: number;
  isActive: boolean; createdAt: Date;
}
let _clientCache: CachedClient[] | null = null
let _clientCacheTime = 0
const CACHE_TTL = 30_000 // 30 seconds

async function getClientCache(): Promise<CachedClient[]> {
  if (_clientCache && Date.now() - _clientCacheTime < CACHE_TTL) {
    return _clientCache
  }
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, email: true, passwordHash: true, creditsPerMonth: true, isActive: true, createdAt: true },
  })
  _clientCache = clients as CachedClient[]
  _clientCacheTime = Date.now()
  return _clientCache
}

function invalidateClientCache() {
  _clientCache = null
}

async function findOrCreateGoogleClient(clientName: string) {
  const normalizedName = clientName.trim().replace(/\s+/g, ' ')

  const allClients = await getClientCache()
  const realClients = allClients.filter(
    (c) => c.isActive && !c.email.endsWith('@import.local')
  )

  // 1. Confident match on real clients (exact -> unique token-subset -> strict fuzzy)
  const realIdx = matchClientNameIndex(normalizedName, realClients.map((c) => c.name))
  if (realIdx !== null) return realClients[realIdx]

  // 2. Confident match across ALL clients (including imported placeholders)
  const allIdx = matchClientNameIndex(normalizedName, allClients.map((c) => c.name))
  if (allIdx !== null) return allClients[allIdx]

  // 3. No confident match — return null (a visible [NO_ACCOUNT] Block is created)
  console.log(`[Sync] No confident client match for "${normalizedName}" — will create Block`)
  return null
}

/**
 * When a Google event title changes, decide whether the linked booking should
 * point at a *different* existing client. Returns a new clientId only on a
 * confident match to a real (non-imported, active) client that differs from the
 * one currently linked. Returns null otherwise (no re-link, no guessing).
 *
 * This fixes the "Geoffrey renames the RDV on Google but the app keeps the old
 * client" bug: previously the update path only propagated start/end times and
 * froze the client chosen at creation.
 */
async function resolveRelinkClientId(
  summary: string | null | undefined,
  currentClientId: number
): Promise<number | null> {
  const parsed = parseGoogleEventSummary(summary)
  if (parsed.type !== 'booking' || !parsed.clientName) return null

  const allClients = await getClientCache()
  const realClients = allClients.filter(
    (c) => c.isActive && !c.email.endsWith('@import.local')
  )
  if (realClients.length === 0) return null

  const idx = matchClientNameIndex(parsed.clientName, realClients.map((c) => c.name))
  if (idx === null) return null

  const matched = realClients[idx]
  return matched.id !== currentClientId ? matched.id : null
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

  // Garde anti-doublon UNIQUEMENT pour 'create' : une résa importée de Google
  // a déjà son événement côté Google, la re-créer ferait un double.
  // Les 'update' et 'delete' sont de vraies actions utilisateur (client/admin)
  // et doivent toujours être propagés — avant, un RDV importé de Google puis
  // déplacé dans l'app n'était jamais répercuté sur Google Calendar (le garde
  // marquait même la résa "synced" sans rien pousser).
  if (booking.syncSource === 'google' && action === 'create' && booking.googleEventId) {
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
    summary: `RDV — ${booking.client.name}`,
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
    if (action === 'delete') {
      // GARDE : un booking jamais synchronisé (googleEventId null) qu'on
      // annule ne doit RIEN créer côté Google. Avant, il tombait dans la
      // branche "create" ci-dessous et l'annulation faisait apparaître un
      // événement fantôme sur le calendrier.
      if (booking.googleEventId) {
        await deleteGoogleEvent(booking.googleEventId)
      }
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
          syncSource: 'app',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    }

    logSync('Booking', bookingId, `push_${action}`, 'app_to_google')
    return { success: true }
  } catch (error) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { syncStatus: 'error' },
    })
    logSync('Booking', bookingId, 'error', 'app_to_google', {
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

  // Même garde anti-doublon que pushBookingToGoogle : seul un 'create' sur un
  // bloc déjà lié à un événement Google est ignoré. 'update' et 'delete'
  // doivent toujours être propagés (avant, supprimer dans l'app un bloc
  // importé de Google le laissait sur le calendrier → il réapparaissait à la
  // sync suivante).
  if (block.syncSource === 'google' && action === 'create' && block.googleEventId) {
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
    summary: block.reason ? `Indisponible — ${block.reason}` : 'Indisponible',
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
    if (action === 'delete') {
      // Même garde que pushBookingToGoogle : supprimer un bloc jamais
      // synchronisé ne doit pas CRÉER d'événement Google.
      if (block.googleEventId) {
        await deleteGoogleEvent(block.googleEventId)
      }
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
          syncSource: 'app',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
    }

    logSync('Block', blockId, `push_${action}`, 'app_to_google')
    return { success: true }
  } catch (error) {
    await prisma.block.update({
      where: { id: blockId },
      data: { syncStatus: 'error' },
    })
    logSync('Block', blockId, 'error', 'app_to_google', {
      error: String(error),
    })
    throw error
  }
}

export async function pullFromGoogle(
  googleEvent: GoogleCalendarEvent | null,
  googleEventId: string
): Promise<{ action: string; [key: string]: any }> {
  // ─── CANCELLED / DELETED events ───────────────────────────────
  if (!googleEvent || googleEvent.status === 'cancelled') {
    const booking = await prisma.booking.findFirst({ where: { googleEventId } })
    if (booking) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          syncStatus: 'cancelled',
          syncSource: 'google',
          lastSyncedAt: new Date(),
          cancelReason: 'Supprimé depuis Google Calendar',
        },
      })
      logSync('Booking', booking.id, 'pull_delete', 'google_to_app')
      return { action: 'booking_cancelled' }
    }
    const block = await prisma.block.findFirst({ where: { googleEventId } })
    if (block) {
      await prisma.block.delete({ where: { id: block.id } })
      logSync('Block', block.id, 'pull_delete', 'google_to_app')
      return { action: 'block_deleted' }
    }
    return { action: 'not_found' }
  }

  console.log(`[Sync:pull] "${googleEvent.summary}" (${googleEvent.start?.dateTime ?? 'all-day'}) id=${googleEventId}`)

  // ─── Skip all-day events (no specific time) ───────────────────
  const eventStartDt = googleEvent.start?.dateTime
  const eventEndDt = googleEvent.end?.dateTime
  if (!eventStartDt || !eventEndDt) {
    return { action: 'skipped_all_day' }
  }

  // ─── APP-CREATED events (have our tag) — update if record exists ─
  const appSource = googleEvent.extendedProperties?.private?.appSource
  const recordType = googleEvent.extendedProperties?.private?.recordType
  const recordId = googleEvent.extendedProperties?.private?.recordId

  if (appSource === APP_SOURCE_TAG && recordId) {
    try {
      if (recordType === 'booking') {
        const existing = await prisma.booking.findUnique({
          where: { id: parseInt(recordId) },
          select: { googleEtag: true, clientId: true, status: true, cancelReason: true },
        })
        if (!existing) {
          throw { code: 'P2025' }
        }
        // Résurrection : l'événement est VIVANT côté Google alors que le
        // booking avait été annulé PAR la sync (suppression Google puis
        // "Annuler" / undo côté Google, ou faux positif de réconciliation).
        // On restaure AVANT le test d'etag — un undo peut re-servir le même etag.
        const restoreFromCancel =
          existing.status === 'CANCELLED' &&
          !!existing.cancelReason?.includes('Google Calendar')
        // Same etag = echo of our own push -> skip
        if (!restoreFromCancel && existing.googleEtag === googleEvent.etag) {
          return { action: 'etag_unchanged', skipped: true }
        }
        // Etag differs -> real change in Google (e.g. time OR client name edited
        // from GCal) -> propagate the new time and, if the title now confidently
        // matches a different client, re-link the booking to that client.
        const relinkId = await resolveRelinkClientId(googleEvent.summary, existing.clientId)
        await prisma.booking.update({
          where: { id: parseInt(recordId) },
          data: {
            startAt: new Date(eventStartDt),
            endAt: new Date(eventEndDt),
            googleEtag: googleEvent.etag,
            syncSource: 'google',
            syncStatus: 'synced',
            lastSyncedAt: new Date(),
            ...(restoreFromCancel ? { status: 'CONFIRMED', cancelReason: null } : {}),
            ...(relinkId ? { clientId: relinkId } : {}),
          },
        })
        if (restoreFromCancel) {
          logSync('Booking', parseInt(recordId), 'pull_restore', 'google_to_app')
        }
        logSync('Booking', parseInt(recordId), relinkId ? 'pull_update_relink' : 'pull_update', 'google_to_app', relinkId ? { fromClientId: existing.clientId, toClientId: relinkId } : undefined)
        return { action: relinkId ? 'booking_relinked_from_google' : 'booking_updated_from_google' }
      }
      if (recordType === 'block') {
        const existing = await prisma.block.findUnique({
          where: { id: parseInt(recordId) },
          select: { googleEtag: true },
        })
        if (!existing) {
          throw { code: 'P2025' }
        }
        if (existing.googleEtag === googleEvent.etag) {
          return { action: 'etag_unchanged', skipped: true }
        }
        await prisma.block.update({
          where: { id: parseInt(recordId) },
          data: {
            startAt: new Date(eventStartDt),
            endAt: new Date(eventEndDt),
            googleEtag: googleEvent.etag,
            syncSource: 'google',
            syncStatus: 'synced',
            lastSyncedAt: new Date(),
          },
        })
        logSync('Block', parseInt(recordId), 'pull_update', 'google_to_app')
        return { action: 'block_updated_from_google' }
      }
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        // Record was purged — fall through to re-import
        console.log(`[Sync] Record ${recordType}#${recordId} purged, re-importing ${googleEventId}`)
      } else {
        throw error
      }
    }
  }

  // ─── EXISTING record with same googleEventId — update it ──────
  const [existingBooking, existingBlock] = await Promise.all([
    prisma.booking.findFirst({ where: { googleEventId } }),
    prisma.block.findFirst({ where: { googleEventId } }),
  ])

  if (existingBooking) {
    // Résurrection (voir chemin app-tag ci-dessus) : événement vivant côté
    // Google + booking annulé PAR la sync → on restaure, même à etag identique.
    const restoreFromCancel =
      existingBooking.status === 'CANCELLED' &&
      !!existingBooking.cancelReason?.includes('Google Calendar')
    // Même etag = écho de notre propre push (ou événement déjà à jour) → skip.
    // Indispensable après une purge : l'étiquette recordId de l'événement
    // Google pointe vers un id supprimé, donc TOUS ses échos retombaient ici
    // et déclenchaient un update + résolution client à chaque sync (boucle
    // "purged, re-importing" + runs de 70s+, cf. logs Vercel).
    if (!restoreFromCancel && existingBooking.googleEtag === googleEvent.etag) {
      return { action: 'etag_unchanged', skipped: true }
    }
    try {
      const relinkId = await resolveRelinkClientId(googleEvent.summary, existingBooking.clientId)
      await prisma.booking.update({
        where: { id: existingBooking.id },
        data: {
          startAt: new Date(eventStartDt),
          endAt: new Date(eventEndDt),
          googleEtag: googleEvent.etag,
          syncSource: 'google',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          ...(restoreFromCancel ? { status: 'CONFIRMED', cancelReason: null } : {}),
          ...(relinkId ? { clientId: relinkId } : {}),
        },
      })
      if (restoreFromCancel) {
        logSync('Booking', existingBooking.id, 'pull_restore', 'google_to_app')
      }
      if (relinkId) {
        logSync('Booking', existingBooking.id, 'pull_update_relink', 'google_to_app', {
          fromClientId: existingBooking.clientId,
          toClientId: relinkId,
        })
      }
      return { action: relinkId ? 'booking_relinked' : 'booking_updated' }
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return { action: 'record_deleted_skipped', skipped: true }
      }
      throw error
    }
  }

  if (existingBlock) {
    // Preserve [NO_ACCOUNT] prefix if block was tagged
    const existingReason = existingBlock.reason ?? ''
    const isNoAccount = existingReason.startsWith('[NO_ACCOUNT]')

    // Réconciliation tardive : le compte client a peut-être été créé APRÈS
    // l'import de ce bloc [NO_ACCOUNT]. Si un match confiant existe
    // maintenant, on promeut le bloc en vraie réservation.
    if (isNoAccount) {
      const pendingName = noAccountBlockName(existingReason)
      if (pendingName) {
        const client = await findOrCreateGoogleClient(pendingName)
        if (client) {
          const startDate = new Date(eventStartDt)
          const endDate = new Date(eventEndDt)
          const dupe = await prisma.booking.findFirst({
            where: { clientId: client.id, startAt: startDate, status: 'CONFIRMED' },
          })
          if (!dupe) {
            const promoted = await prisma.booking.create({
              data: {
                clientId: client.id,
                startAt: startDate,
                endAt: endDate,
                status: 'CONFIRMED',
                mode: 'VISIO',
                googleEventId,
                googleEtag: googleEvent.etag,
                syncSource: 'google',
                syncStatus: 'synced',
                lastSyncedAt: new Date(),
                bookedBy: 'google',
              },
            })
            await prisma.block.delete({ where: { id: existingBlock.id } }).catch(() => {})
            logSync('Booking', promoted.id, 'pull_promote_no_account', 'google_to_app', {
              fromBlockId: existingBlock.id,
              clientId: client.id,
            })
            return { action: 'block_promoted_to_booking', id: promoted.id, clientId: client.id }
          }
        }
      }
    }

    const newReason = isNoAccount ? existingReason : (googleEvent.summary || existingReason)
    try {
      await prisma.block.update({
        where: { id: existingBlock.id },
        data: {
          startAt: new Date(eventStartDt),
          endAt: new Date(eventEndDt),
          reason: newReason,
          googleEtag: googleEvent.etag,
          syncSource: 'google',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
        },
      })
      return { action: 'block_updated', id: existingBlock.id }
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return { action: 'record_deleted_skipped', skipped: true }
      }
      throw error
    }
  }

  // ─── NEW EVENT — parse and import ─────────────────────────────
  const parsed = parseGoogleEventSummary(googleEvent.summary)
  const startDate = new Date(eventStartDt)
  const endDate = new Date(eventEndDt)

  // Récurrences infinies : on n'importe pas au-delà de l'horizon utile
  if (isBeyondImportHorizon(startDate)) {
    return { action: 'skipped_beyond_horizon' }
  }

  if (parsed.type === 'booking') {
    const client = await findOrCreateGoogleClient(parsed.clientName || 'Client Google')

    if (!client) {
      // Dedupe: don't create a second [NO_ACCOUNT] block for same name + same time
      const existingNoAccount = await prisma.block.findFirst({
        where: {
          startAt: startDate,
          reason: { startsWith: `[NO_ACCOUNT] RDV — ${parsed.clientName}` },
        },
      })
      if (existingNoAccount) {
        return { action: 'duplicate_skipped', clientName: parsed.clientName }
      }

      const newBlock = await prisma.block.create({
        data: {
          startAt: startDate,
          endAt: endDate,
          reason: `[NO_ACCOUNT] RDV — ${parsed.clientName || 'Client Google'}`,
          googleEventId,
          syncSource: 'google',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
        },
      })
      logSync('Block', newBlock.id, 'pull_create_no_client', 'google_to_app', {
        summary: googleEvent.summary,
        clientName: parsed.clientName,
      })
      console.log(`[Sync:pull] → [NO_ACCOUNT] block #${newBlock.id} for "${parsed.clientName}"`)
      return { action: 'block_created_no_account', id: newBlock.id, clientName: parsed.clientName }
    }

    // Dedupe: don't create a second booking for same client + same start time
    const existingDupe = await prisma.booking.findFirst({
      where: {
        clientId: client.id,
        startAt: startDate,
        status: 'CONFIRMED',
      },
    })
    if (existingDupe) {
      return { action: 'duplicate_skipped', clientName: parsed.clientName }
    }

    const newBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        startAt: startDate,
        endAt: endDate,
        status: 'CONFIRMED',
        mode: 'VISIO',
        googleEventId,
        googleEtag: googleEvent.etag,
        syncSource: 'google',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        bookedBy: 'google',
      },
    })
    logSync('Booking', newBooking.id, 'pull_create', 'google_to_app', {
      summary: googleEvent.summary,
      clientName: parsed.clientName,
    })
    return { action: 'booking_created', id: newBooking.id, clientName: parsed.clientName }
  }

  // Non-booking event (personal block, simple block, etc.)
  const newBlock = await prisma.block.create({
    data: {
      startAt: startDate,
      endAt: endDate,
      reason: parsed.reason,
      googleEventId,
      syncSource: 'google',
      syncStatus: 'synced',
      lastSyncedAt: new Date(),
      createdAt: new Date(),
    },
  })
  logSync('Block', newBlock.id, 'pull_create', 'google_to_app', {
    summary: googleEvent.summary,
  })
  return { action: 'block_created', id: newBlock.id, type: parsed.type }
}

// ─── BULK IMPORT (used after purge — fast, no per-event DB queries) ──
export type BulkImportResult = {
  bookingsCreated: number
  blocksCreated: number
  noAccountBlocks: number
  skippedAllDay: number
  skippedCancelled: number
  skippedHorizon: number
  errors: number
  details: Array<{ summary: string; action: string }>
}

export async function bulkImportFromGoogle(
  events: GoogleCalendarEvent[]
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    bookingsCreated: 0,
    blocksCreated: 0,
    noAccountBlocks: 0,
    skippedAllDay: 0,
    skippedCancelled: 0,
    skippedHorizon: 0,
    errors: 0,
    details: [],
  }

  // 1. Pre-fetch all clients ONCE
  const allClients = await prisma.client.findMany({
    select: { id: true, name: true, email: true, isActive: true },
  })
  const realClients = allClients.filter(
    (c) => c.isActive && !c.email.endsWith('@import.local')
  )

  // Helper: match client name in-memory (same safe logic as findOrCreateGoogleClient)
  function matchClient(clientName: string): { id: number; name: string } | null {
    const normalizedName = clientName.trim().replace(/\s+/g, ' ')

    // Confident match on real clients first, then across all clients
    const realIdx = matchClientNameIndex(normalizedName, realClients.map((c) => c.name))
    if (realIdx !== null) return realClients[realIdx]

    const allIdx = matchClientNameIndex(normalizedName, allClients.map((c) => c.name))
    if (allIdx !== null) return allClients[allIdx]

    return null
  }

  // 2. Parse all events and classify them
  const bookingsToCreate: Array<{
    clientId: number
    startAt: Date
    endAt: Date
    googleEventId: string
    googleEtag: string
  }> = []
  const blocksToCreate: Array<{
    startAt: Date
    endAt: Date
    reason: string
    googleEventId: string
    googleEtag: string
  }> = []

  for (const event of events) {
    if (!event || event.status === 'cancelled') {
      result.skippedCancelled++
      continue
    }

    const startDt = event.start?.dateTime
    const endDt = event.end?.dateTime
    if (!startDt || !endDt) {
      result.skippedAllDay++
      continue
    }

    const parsed = parseGoogleEventSummary(event.summary)
    const startAt = new Date(startDt)
    const endAt = new Date(endDt)

    if (isBeyondImportHorizon(startAt)) {
      result.skippedHorizon++
      continue
    }

    if (parsed.type === 'booking') {
      const client = matchClient(parsed.clientName || 'Client Google')
      if (client) {
        bookingsToCreate.push({
          clientId: client.id,
          startAt,
          endAt,
          googleEventId: event.id,
          googleEtag: event.etag,
        })
        result.details.push({ summary: event.summary ?? '', action: `booking → ${client.name}` })
      } else {
        blocksToCreate.push({
          startAt,
          endAt,
          reason: `[NO_ACCOUNT] RDV — ${parsed.clientName || 'Client Google'}`,
          googleEventId: event.id,
          googleEtag: event.etag,
        })
        result.noAccountBlocks++
        result.details.push({ summary: event.summary ?? '', action: `no_account → ${parsed.clientName}` })
      }
    } else {
      blocksToCreate.push({
        startAt,
        endAt,
        reason: parsed.reason,
        googleEventId: event.id,
        googleEtag: event.etag,
      })
      result.details.push({ summary: event.summary ?? '', action: `block → ${parsed.reason}` })
    }
  }

  // 3. Deduplicate: same client + same start time = keep only the first
  const seenBookings = new Set<string>()
  const dedupedBookings = bookingsToCreate.filter((b) => {
    const key = `${b.clientId}-${b.startAt.getTime()}`
    if (seenBookings.has(key)) return false
    seenBookings.add(key)
    return true
  })
  const seenBlocks = new Set<string>()
  const dedupedBlocks = blocksToCreate.filter((b) => {
    const key = `${b.reason}-${b.startAt.getTime()}`
    if (seenBlocks.has(key)) return false
    seenBlocks.add(key)
    return true
  })
  const skippedDupes = (bookingsToCreate.length - dedupedBookings.length) + (blocksToCreate.length - dedupedBlocks.length)
  if (skippedDupes > 0) {
    console.log(`[Sync:bulk] Skipped ${skippedDupes} duplicate entries`)
  }

  // 4. Batch create all records (2 queries instead of hundreds)
  if (dedupedBookings.length > 0) {
    const created = await prisma.booking.createMany({
      data: dedupedBookings.map((b) => ({
        clientId: b.clientId,
        startAt: b.startAt,
        endAt: b.endAt,
        status: 'CONFIRMED',
        mode: 'VISIO',
        googleEventId: b.googleEventId,
        googleEtag: b.googleEtag,
        syncSource: 'google',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        bookedBy: 'google',
      })),
      skipDuplicates: true,
    })
    result.bookingsCreated = created.count
  }

  if (dedupedBlocks.length > 0) {
    const created = await prisma.block.createMany({
      data: dedupedBlocks.map((b) => ({
        startAt: b.startAt,
        endAt: b.endAt,
        reason: b.reason,
        googleEventId: b.googleEventId,
        googleEtag: b.googleEtag,
        syncSource: 'google',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
      })),
      skipDuplicates: true,
    })
    result.blocksCreated = created.count
  }

  console.log(`[Sync:bulk] ${result.bookingsCreated} bookings, ${result.blocksCreated} blocks (${result.noAccountBlocks} no-account), ${result.skippedAllDay} all-day skipped`)

  return result
}

// ─── RÉCONCILIATION [NO_ACCOUNT] → Booking ───────────────────────
// Appelée quand un compte client vient d'être créé : tous les blocs
// [NO_ACCOUNT] dont le nom matche ce client de façon confiante sont
// convertis en vraies réservations (l'historique et les RDV futurs
// apparaissent enfin sur la fiche du client).
export async function reconcileNoAccountBlocksForClient(
  clientId: number
): Promise<{ converted: number; skippedDupes: number }> {
  invalidateClientCache()

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  })
  if (!client) return { converted: 0, skippedDupes: 0 }

  const blocks = await prisma.block.findMany({
    where: { reason: { startsWith: NO_ACCOUNT_PREFIX } },
    select: { id: true, startAt: true, endAt: true, reason: true, googleEventId: true, googleEtag: true },
  })

  let converted = 0
  let skippedDupes = 0

  for (const block of blocks) {
    const pendingName = noAccountBlockName(block.reason)
    if (!pendingName) continue
    // Match confiant uniquement (exact / sous-ensemble de tokens / typo stricte)
    if (matchClientNameIndex(pendingName, [client.name]) === null) continue

    const dupe = await prisma.booking.findFirst({
      where: { clientId: client.id, startAt: block.startAt, status: 'CONFIRMED' },
      select: { id: true },
    })
    if (dupe) {
      // La réservation existe déjà (créée à la main) — on retire juste le bloc
      await prisma.block.delete({ where: { id: block.id } }).catch(() => {})
      skippedDupes++
      continue
    }

    const booking = await prisma.booking.create({
      data: {
        clientId: client.id,
        startAt: block.startAt,
        endAt: block.endAt,
        status: 'CONFIRMED',
        mode: 'VISIO',
        googleEventId: block.googleEventId,
        googleEtag: block.googleEtag,
        syncSource: 'google',
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        bookedBy: 'google',
      },
    })
    await prisma.block.delete({ where: { id: block.id } }).catch(() => {})
    logSync('Booking', booking.id, 'reconcile_no_account', 'google_to_app', {
      fromBlockId: block.id,
      clientId: client.id,
      pendingName,
    })
    converted++
  }

  if (converted > 0 || skippedDupes > 0) {
    console.log(
      `[Sync:reconcile] Client #${client.id} "${client.name}": ${converted} bloc(s) convertis, ${skippedDupes} doublon(s) nettoyés`
    )
  }
  return { converted, skippedDupes }
}

// ─── RE-PUSH des réservations jamais synchronisées ───────────────
// Après une panne d'auth Google, les RDV créés dans l'app n'ont pas de
// googleEventId et ne sont jamais retentés. Cette fonction les repousse
// (appelée à chaque cron de sync — auto-guérison).
export async function repushUnsyncedBookings(
  limit = 50
): Promise<{ pushed: number; failed: number }> {
  const unsynced = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      googleEventId: null,
      startAt: { gte: new Date() },
      syncSource: { not: 'google' },
    },
    select: { id: true },
    orderBy: { startAt: 'asc' },
    take: limit,
  })

  let pushed = 0
  let failed = 0
  for (const b of unsynced) {
    try {
      await pushBookingToGoogle(b.id, 'create')
      pushed++
    } catch (err) {
      failed++
      console.error(`[Sync:repush] Booking #${b.id} failed:`, err instanceof Error ? err.message : err)
      // Auth morte → inutile d'insister sur les suivants
      if (failed >= 3) break
    }
  }

  if (unsynced.length > 0) {
    console.log(`[Sync:repush] ${pushed}/${unsynced.length} réservations repoussées vers Google (${failed} échecs)`)
  }
  return { pushed, failed }
}

// ─── RÉCONCILIATION DB ↔ GOOGLE (filet de sécurité anti-fantômes) ────
// Problème structurel corrigé (incident du 24/08 : RDV du 10/09 15h-21h
// supprimé côté téléphone mais resté CONFIRMED dans l'app) : une suppression
// Google peut échapper aux deltas (webhook manqué, syncToken réinitialisé
// après panne d'auth/purge — la full sync ne voyait pas les suppressions, et
// un syncToken établi APRÈS la suppression ne la rejouera jamais).
// Principe : à partir d'un LISTING COMPLET de la fenêtre [maintenant-30j,
// +365j], tout booking CONFIRMED futur (ou Block futur) dont l'événement
// Google n'existe plus est annulé/supprimé localement. Diff pur, idempotent.

export type ReconcileResult = {
  scanned: number
  activeInGoogle: number
  bookingsCancelled: number
  blocksDeleted: number
  aborted: string | null
}

// Ne juger que les enregistrements dont l'événement DEVRAIT être couvert par
// la fenêtre du listing (timeMax = +365j) — marge de sécurité de 5 jours.
const RECONCILE_HORIZON_DAYS = 360

export const RECONCILE_CANCEL_REASON =
  'Supprimé de Google Calendar (réconciliation)'

export async function reconcileDeletionsFromGoogle(
  events: GoogleCalendarEvent[]
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned: 0,
    activeInGoogle: 0,
    bookingsCancelled: 0,
    blocksDeleted: 0,
    aborted: null,
  }

  // Garde-fou n°1 : un listing vide alors que la base attend des événements
  // signifie presque sûrement un listing cassé/tronqué → on ne touche à rien.
  if (events.length === 0) {
    result.aborted = 'empty_listing'
    logSync('GoogleToken', undefined, 'reconcile_aborted', 'google_to_app', {
      reason: 'empty_listing',
    })
    return result
  }

  const activeIds = new Set<string>()
  for (const event of events) {
    if (event && event.status !== 'cancelled') activeIds.add(event.id)
  }
  result.activeInGoogle = activeIds.size

  const now = new Date()
  const horizon = new Date(
    now.getTime() + RECONCILE_HORIZON_DAYS * 24 * 60 * 60 * 1000
  )

  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        googleEventId: { not: null },
        startAt: { gte: now, lt: horizon },
      },
      select: { id: true, googleEventId: true, startAt: true },
    }),
    prisma.block.findMany({
      where: {
        googleEventId: { not: null },
        startAt: { gte: now, lt: horizon },
      },
      select: { id: true, googleEventId: true, startAt: true },
    }),
  ])
  result.scanned = bookings.length + blocks.length

  const bookingsToCancel = bookings.filter(
    (b) => b.googleEventId && !activeIds.has(b.googleEventId)
  )
  const blocksToDelete = blocks.filter(
    (b) => b.googleEventId && !activeIds.has(b.googleEventId)
  )

  // Garde-fou n°2 : si plus de la moitié des enregistrements (et > 10)
  // seraient supprimés d'un coup, le listing est suspect (page manquante,
  // erreur API) → on n'applique rien et on trace.
  const totalToRemove = bookingsToCancel.length + blocksToDelete.length
  if (totalToRemove > 10 && totalToRemove > result.scanned / 2) {
    result.aborted = 'suspicious_mass_delete'
    logSync('GoogleToken', undefined, 'reconcile_aborted', 'google_to_app', {
      reason: 'suspicious_mass_delete',
      scanned: result.scanned,
      wouldRemove: totalToRemove,
      activeInGoogle: activeIds.size,
    })
    return result
  }

  for (const booking of bookingsToCancel) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelReason: RECONCILE_CANCEL_REASON,
        syncStatus: 'cancelled',
        syncSource: 'google',
        lastSyncedAt: new Date(),
      },
    })
    logSync('Booking', booking.id, 'reconcile_delete', 'google_to_app', {
      googleEventId: booking.googleEventId,
      startAt: booking.startAt.toISOString(),
    })
    result.bookingsCancelled++
  }

  for (const block of blocksToDelete) {
    await prisma.block.delete({ where: { id: block.id } }).catch(() => {})
    logSync('Block', block.id, 'reconcile_delete', 'google_to_app', {
      googleEventId: block.googleEventId,
      startAt: block.startAt.toISOString(),
    })
    result.blocksDeleted++
  }

  if (result.bookingsCancelled > 0 || result.blocksDeleted > 0) {
    console.log(
      `[Sync:reconcile] ${result.bookingsCancelled} booking(s) annulé(s), ${result.blocksDeleted} bloc(s) supprimé(s) (fantômes Google)`
    )
  }
  return result
}

// ─── RE-TENTATIVE des suppressions Google échouées ───────────────
// Un booking annulé dans l'app dont le push_delete a échoué (panne d'auth,
// timeout) laisse l'événement sur le calendrier de Geoffrey. Ce filet
// retente la suppression pour les annulés futurs encore marqués error/pending.
export async function retryFailedCancellations(
  limit = 25
): Promise<{ retried: number; failed: number }> {
  const stuck = await prisma.booking.findMany({
    where: {
      status: 'CANCELLED',
      googleEventId: { not: null },
      syncStatus: { in: ['error', 'pending'] },
      startAt: { gte: new Date() },
    },
    select: { id: true },
    take: limit,
  })

  let retried = 0
  let failed = 0
  for (const b of stuck) {
    try {
      await pushBookingToGoogle(b.id, 'delete')
      retried++
    } catch (err) {
      failed++
      console.error(
        `[Sync:retry-cancel] Booking #${b.id} delete failed:`,
        err instanceof Error ? err.message : err
      )
      if (failed >= 3) break
    }
  }
  return { retried, failed }
}

function logSync(
  table: string,
  recordId: number | undefined,
  action: string,
  direction: string,
  details?: object
): void {
  // Fire-and-forget: don't block sync processing for logging
  prisma.syncLog.create({
    data: {
      table,
      recordId: recordId ?? null,
      action,
      direction,
      details: details ?? {},
    },
  }).catch((e: unknown) => console.error('[SyncLog] Write failed:', e))
}
