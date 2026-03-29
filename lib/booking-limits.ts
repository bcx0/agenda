import { prisma } from './prisma'

export interface BookingLimitResult {
  allowed: boolean
  reason: string | null
  existingBookingDate: Date | null
  bookingsThisWeek: number
}

export function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - diffToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export async function checkBookingLimit(
  clientEmail: string,
  targetDate: Date
): Promise<BookingLimitResult> {
  const email = clientEmail.trim().toLowerCase()
  if (!email) {
    return {
      allowed: false,
      reason: 'Adresse email requise.',
      existingBookingDate: null,
      bookingsThisWeek: 0,
    }
  }

  const { monday, sunday } = getWeekBounds(targetDate)

  const existingBookings = await prisma.booking.findMany({
    where: {
      client: {
        email: email,
      },
      bookedBy: 'client',
      status: { not: 'CANCELLED' },
      startAt: { gte: monday, lte: sunday },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true, startAt: true },
  })

  if (existingBookings.length >= 1) {
    return {
      allowed: false,
      reason: 'Limite atteinte, réessayez la semaine prochaine.',
      existingBookingDate: existingBookings[0].startAt,
      bookingsThisWeek: existingBookings.length,
    }
  }

  return { allowed: true, reason: null, existingBookingDate: null, bookingsThisWeek: 0 }
}
