import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    const code = new URL(request.url).searchParams.get('code')
    if (!code) {
          return NextResponse.redirect(
                  'https://agenda-geoffreymahieu.vercel.app/admin?error=google_auth_failed'
                )
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
    const tokens = await tokenRes.json()

  if (!tokens.refresh_token) {
        return NextResponse.redirect(
                'https://agenda-geoffreymahieu.vercel.app/admin?error=missing_refresh_token'
              )
  }

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
                Authorization: `Bearer ${tokens.access_token}`,
        },
  })
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

  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/watch`, { method: 'POST' })

  return NextResponse.redirect(
        'https://agenda-geoffreymahieu.vercel.app/admin?success=google_connected'
      )
}
