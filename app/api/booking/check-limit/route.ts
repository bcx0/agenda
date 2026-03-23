import { NextRequest, NextResponse } from 'next/server'
import { checkBookingLimit } from '@/lib/booking-limits'

export async function POST(request: NextRequest) {
  try {
    const { email, date } = await request.json()
    if (!email || !date) {
      return NextResponse.json({ error: 'Email et date requis' }, { status: 400 })
    }
    const result = await checkBookingLimit(email, new Date(date))
    return NextResponse.json({ allowed: result.allowed, message: result.reason })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
