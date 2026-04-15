import { prisma } from './prisma'
import { GoogleReauthRequiredError } from './google-errors'

const DEFAULT_TIMEZONE = 'Europe/Paris'

// Log an auth error in SyncLog so admin UI / monitoring can surface it.
// Fire-and-forget — never block or rethrow on logging failure.
async function logAuthError(message: string, reason: string): Promise<void> {
  try {
    await prisma.syncLog.create({
      data: {
        table: 'GoogleToken',
        action: 'auth_error',
        direction: 'google',
        details: { message, reason },
      },
    })
  } catch (e) {
    console.error('[GoogleCalendar] Failed to log auth error:', e)
  }
}

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

// ─── getValidAccessToken ────────────────────────────────────────────
// Retourne un access token valide.
// Refresh automatique si expiré (marge de 5 minutes).
// forceRefresh = true pour ignorer le cache et forcer un nouveau token.

export async function getValidAccessToken(
  forceRefresh = false
): Promise<string> {
  const token = await prisma.googleToken.findFirst()

  if (!token) {
    throw new Error('Google Calendar non connecté — aucun token en base')
  }

  // Si le token est encore valide et qu'on ne force pas le refresh
  const isValid =
    !forceRefresh && token.expiresAt > new Date(Date.now() + 5 * 60 * 1000)

  if (isValid) return token.accessToken

  // ─── Refresh du token ───────────────────────────────────────────
  console.log('[GoogleCalendar] Refreshing access token...')

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

  // Vérifier si Google a renvoyé une erreur
  if (!res.ok || !refreshed.access_token) {
    const errorDetail = refreshed.error_description || refreshed.error || 'unknown'
    console.error(
      '[GoogleCalendar] Refresh token FAILED:',
      res.status,
      errorDetail
    )

    // Si invalid_grant → le refresh token est expiré/révoqué
    // (projet Google Cloud en mode "Testing" = expiration 7 jours)
    if (refreshed.error === 'invalid_grant') {
      await logAuthError(errorDetail, 'invalid_grant')
      throw new GoogleReauthRequiredError(
        'Refresh token Google expiré ou révoqué. ' +
          'Reconnectez Google Calendar depuis le panel admin. ' +
          'Si le problème revient tous les 7 jours, passez le projet Google Cloud en mode "Production".',
        'invalid_grant'
      )
    }

    throw new Error(
      `Échec du refresh token Google: ${res.status} ${errorDetail}`
    )
  }

  console.log('[GoogleCalendar] Token refreshed successfully')

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

// ─── Helper: appel API Google avec retry auto sur 401 ───────────────
// Si Google renvoie 401, on force un refresh et on retente UNE fois.

async function googleApiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let accessToken = await getValidAccessToken()

  let res = await fetch(url, {
    ...options,
    headers: {
      ...((options.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })

  // Si 401 → force refresh et retry une fois
  if (res.status === 401) {
    console.warn(
      '[GoogleCalendar] API returned 401, forcing token refresh and retrying...'
    )
    accessToken = await getValidAccessToken(true) // forceRefresh

    res = await fetch(url, {
      ...options,
      headers: {
        ...((options.headers as Record<string, string>) || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    })

    // Si toujours 401 après refresh forcé → le refresh a "réussi" côté
    // OAuth mais l'API Calendar rejette toujours. Signifie que le token
    // est probablement révoqué côté utilisateur ou les scopes sont invalides.
    if (res.status === 401) {
      const errBody = await res.clone().text().catch(() => 'no body')
      await logAuthError(
        `Calendar API 401 after forced refresh: ${errBody.slice(0, 500)}`,
        'post_refresh_401'
      )
      throw new GoogleReauthRequiredError(
        'Google Calendar rejette encore le token après refresh. ' +
          'Reconnectez Google Calendar depuis le panel admin.',
        'post_refresh_401'
      )
    }
  }

  return res
}

// ─── createGoogleEvent ──────────────────────────────────────────────

export async function createGoogleEvent(
  payload: GoogleEventPayload
): Promise<any> {
  const res = await googleApiFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(
      `Google createGoogleEvent failed: ${res.status} ${JSON.stringify(err)}`
    )
  }

  return res.json()
}

// ─── updateGoogleEvent ──────────────────────────────────────────────

export async function updateGoogleEvent(
  googleEventId: string,
  payload: GoogleEventPayload
): Promise<any> {
  const res = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(
      `Google updateGoogleEvent failed: ${res.status} ${JSON.stringify(err)}`
    )
  }

  return res.json()
}

// ─── deleteGoogleEvent ──────────────────────────────────────────────

export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  console.log('[GoogleCalendar] Deleting event:', googleEventId)

  const res = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    { method: 'DELETE' }
  )

  // 204 = deleted, 410 = already deleted (both are fine)
  if (!res.ok && res.status !== 410) {
    const errText = await res.text().catch(() => 'no body')
    console.error('[GoogleCalendar] Delete failed:', res.status, errText)
    throw new Error(
      `Google deleteGoogleEvent failed (${res.status}): ${errText}`
    )
  }

  console.log(
    '[GoogleCalendar] Event deleted successfully:',
    googleEventId,
    'status:',
    res.status
  )
}

// ─── fetchChangedEvents ─────────────────────────────────────────────

export async function fetchChangedEvents(
  syncToken?: string | null
): Promise<{
  items: GoogleCalendarEvent[]
  nextSyncToken: string | null
  fullSyncRequired: boolean
}> {
  let allItems: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null

  do {
    let url =
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250'

    if (syncToken) {
      url += `&syncToken=${syncToken}`
    } else {
      const timeMin = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString()
      const timeMax = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString()
      url += `&timeMin=${timeMin}&timeMax=${timeMax}`
    }

    if (pageToken) {
      url += `&pageToken=${pageToken}`
    }

    const res = await googleApiFetch(url)

    if (res.status === 410) {
      return { items: [], nextSyncToken: null, fullSyncRequired: true }
    }

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(
        `Google fetchChangedEvents failed: ${res.status} ${errText}`
      )
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
