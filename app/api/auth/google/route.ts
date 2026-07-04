import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSession } from '@/lib/session'

// NB : garder en phase avec le callback (app/api/auth/google/callback/route.ts)
const OAUTH_STATE_COOKIE = 'gm_google_oauth_state'

export async function GET() {
  // Seul l'admin connecté peut initier la connexion Google Calendar
  if (!getAdminSession()) {
    return NextResponse.redirect(
      new URL('/admin', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    )
  }

  // Paramètre state anti-CSRF, vérifié dans le callback
  const state = crypto.randomBytes(16).toString('hex')
  cookies().set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600
  })

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
