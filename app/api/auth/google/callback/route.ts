import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

// NB : garder en phase avec app/api/auth/google/route.ts
const OAUTH_STATE_COOKIE = 'gm_google_oauth_state'

function appUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'https://agenda-geoffreymahieu.vercel.app'
  return `${base.replace(/\/$/, '')}${path}`
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Vérification anti-CSRF : le state doit correspondre au cookie posé
  // au départ du flow par /api/auth/google (admin connecté uniquement).
  const cookieStore = cookies()
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value
  cookieStore.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 })
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl('/admin?error=google_auth_failed'))
  }

  if (!code) {
    return NextResponse.redirect(appUrl('/admin?error=google_auth_failed'))
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    console.error('[OAuth callback] Token exchange failed:', tokenRes.status)
    return NextResponse.redirect(appUrl('/admin?error=google_auth_failed'))
  }
  const tokens = await tokenRes.json()

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_in) {
    return NextResponse.redirect(appUrl('/admin?error=missing_refresh_token'))
  }

  // Consentement granulaire Google : si les cases calendrier ne sont PAS
  // cochées, l'OAuth "réussit" quand même mais le token n'a que le scope
  // email → tous les appels Calendar renvoient ensuite 401 Invalid
  // Credentials (pannes récurrentes du 13-14/07 : chaque reconnexion faite
  // sans cocher les cases cassait la sync ~1h plus tard, au premier refresh).
  // On refuse net la connexion et on explique quoi faire.
  const grantedScopes = String(tokens.scope ?? '').split(' ')
  const hasCalendarScope = grantedScopes.some(
    (scope) =>
      scope === 'https://www.googleapis.com/auth/calendar' ||
      scope === 'https://www.googleapis.com/auth/calendar.events'
  )
  if (!hasCalendarScope) {
    console.error('[OAuth callback] Calendar scope missing. Granted:', tokens.scope)
    await prisma.syncLog
      .create({
        data: {
          table: 'GoogleToken',
          action: 'auth_error',
          direction: 'google',
          details: { reason: 'missing_calendar_scope', grantedScopes: tokens.scope ?? '' },
        },
      })
      .catch(() => {})
    return NextResponse.redirect(
      appUrl(
        '/admin?error=' +
          encodeURIComponent(
            "Connexion refusée : les cases d'accès à Google Agenda n'ont pas été cochées. Recommencez et cochez TOUTES les cases sur l'écran Google."
          )
      )
    )
  }

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  })
  if (!userInfoRes.ok) {
    console.error('[OAuth callback] userinfo failed:', userInfoRes.status)
    return NextResponse.redirect(appUrl('/admin?error=google_auth_failed'))
  }
  const userInfo = await userInfoRes.json()

  const existing = await prisma.googleToken.findFirst()

  if (existing) {
    await prisma.googleToken.update({
      where: { id: existing.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        googleEmail: userInfo.email,
        syncToken: null,
        updatedAt: new Date(),
      },
    })
  } else {
    await prisma.googleToken.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        googleEmail: userInfo.email,
      },
    })
  }

  // Note: GoogleToken.updatedAt vient d'être rafraîchi ci-dessus, ce qui
  // rend automatiquement caduques les auth_error SyncLog antérieurs
  // (le badge "Reconnexion requise" dans /admin/settings compare
  // recentAuthError.createdAt vs googleToken.updatedAt).

  // Renouvelle le webhook push-notification (route protégée par CRON_SECRET).
  await fetch(appUrl('/api/calendar/watch'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch((err) => console.error('[OAuth callback] Watch renewal failed:', err))

  // ── Auto-sync : rattrape tous les événements manqués pendant la panne ──
  // syncToken a été mis à null ci-dessus, donc le cron fera un full sync
  // au prochain run. Mais on déclenche aussi un sync immédiat (fire-and-forget)
  // pour que les RDV manquants apparaissent dès maintenant sans attendre le cron.
  fetch(appUrl('/api/cron/sync-calendar'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch((err) => console.error('[OAuth callback] Auto-sync failed:', err))

  return NextResponse.redirect(appUrl('/admin?success=google_connected'))
}
