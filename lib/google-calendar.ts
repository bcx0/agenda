import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_TIMEZONE = 'Europe/Paris'

// ─── Types exportés ───────────────────────────────────────────────

export interface GoogleEventPayload {
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties?: {
    private?: {
      appSource: string
      recordType: string
      recordId: string
    }
  }
}

export interface GoogleCalendarEvent {
  id: string
  etag: string
  status: string
  summary?: string
  description?: string
  updated: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  extendedProperties?: {
    private?: {
      appSource?: string
      recordType?: string
      recordId?: string
    }
  }
}

// ─── getValidAccessToken ──────────────────────────────────────────
// Retourne un access token valide.
// Refresh automatique si expiré (marge de 5 minutes).

export async function getValidAccessToken(): Promise<string> {
  const token = await prisma.googleToken.findFirst()

  if (!token) {
    throw new Error('Google Calendar non connecté — aucun token en base')
  }

  const isValid = token.expiresAt > new Date(Date.now() + 5 * 60 * 1000)
  if (isValid) return token.accessToken

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const refreshed = await res.json()

  if (!refreshed.access_token) {
    throw new Error('Échec du refresh token Google')
  }

  await prisma.googleToken.update({
    where: { id: token.id },
    data: {
      accessToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    },
  })

  return refreshed.access_token
}

// ─── createGoogleEvent ────────────────────────────────────────────

export async function createGoogleEvent(payload: GoogleEventPayload): Promise<any> {
  const accessToken = await getValidAccessToken()

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google createGoogleEvent failed: ${JSON.stringify(err)}`)
  }

  return res.json()
}

// ─── updateGoogleEvent ────────────────────────────────────────────

export async function updateGoogleEvent(
  googleEventId: string,
  payload: GoogleEventPayload
): Promise<any> {
  const accessToken = await getValidAccessToken()

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google updateGoogleEvent failed: ${JSON.stringify(err)}`)
  }

  return res.json()
}

// ─── deleteGoogleEvent ────────────────────────────────────────────

export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  const accessToken = await getValidAccessToken()

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
}

// ─── fetchChangedEvents ───────────────────────────────────────────

export async function fetchChangedEvents(syncToken?: string | null): Promise<{
  items: GoogleCalendarEvent[]
  nextSyncToken: string | null
  fullSyncRequired: boolean
}> {
  const accessToken = await getValidAccessToken()

  let allItems: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null

  do {
    let url =
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250'

    if (syncToken) {
      url += `&syncToken=${syncToken}`
    } else {
      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      url += `&timeMin=${timeMin}`
    }

    if (pageToken) {
      url += `&pageToken=${pageToken}`
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (res.status === 410) {
      return { items: [], nextSyncToken: null, fullSyncRequired: true }
    }

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Google fetchChangedEvents failed: ${res.status} ${errText}`)
    }

    const data = await res.json()
    allItems = allItems.concat(data.items ?? [])
    pageToken = data.nextPageToken
    nextSyncToken = data.nextSyncToken ?? null
  } while (pageToken)

  return {
    items: allItems,
    nextSyncToken,
    fullSyncRequired: false,
  }
}