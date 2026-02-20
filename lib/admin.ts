import { DateTime } from "luxon";
import { prisma } from "./prisma";
import { BRUSSELS_TZ, MIAMI_TZ, isWithinMiamiWindow, monthBoundsUtc } from "./time";
import { sendBookingConfirmationEmail, sendBookingUpdatedEmail } from "./email/booking";
import { checkSlotAvailability, cancelBooking } from "./booking";

export async function listClients() {
  return prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });
}

export async function createClient(input: {
  email: string;
  name: string;
  passwordHash: string;
  creditsPerMonth: number;
}) {
  return prisma.client.create({ data: { ...input, isActive: true } });
}

export async function updateCredits(clientId: number, creditsPerMonth: number) {
  return prisma.client.update({
    where: { id: clientId },
    data: { creditsPerMonth }
  });
}

export async function setClientActive(clientId: number, isActive: boolean) {
  return prisma.client.update({
    where: { id: clientId },
    data: { isActive }
  });
}

export async function listBlocks() {
  return prisma.block.findMany({ orderBy: { startAt: "asc" } });
}

export async function listAvailabilityRules() {
  return prisma.availabilityRule.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
  });
}

export async function createAvailabilityRule(
  dayOfWeek: number,
  startTime: string,
  endTime: string
) {
  return prisma.availabilityRule.create({
    data: { dayOfWeek, startTime, endTime }
  });
}

export async function deleteAvailabilityRule(id: number) {
  return prisma.availabilityRule.delete({ where: { id } });
}

export async function listAvailabilityOverrides() {
  return prisma.availabilityOverride.findMany({
    orderBy: [{ date: "asc" }, { startTime: "asc" }]
  });
}

export async function createAvailabilityOverride(input: {
  date: Date;
  startTime: string;
  endTime: string;
  type: "BLOCK" | "OPEN";
  note?: string;
}) {
  return prisma.availabilityOverride.create({
    data: {
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      type: input.type,
      note: input.note ?? null
    }
  });
}

export async function deleteAvailabilityOverride(id: number) {
  return prisma.availabilityOverride.delete({ where: { id } });
}

export async function listRecurringBlocks() {
  return prisma.recurringBlock.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { client: true }
  });
}

export async function createRecurringBlock(input: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeZone?: string;
  clientId?: number | null;
  note?: string;
}) {
  return prisma.recurringBlock.create({
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone ?? "Europe/Brussels",
      clientId: input.clientId ?? null,
      note: input.note ?? null
    }
  });
}

export async function deleteRecurringBlock(id: number) {
  return prisma.recurringBlock.delete({ where: { id } });
}

export async function createBlock(
  startLocal: string,
  durationMinutes: number,
  reason?: string
) {
  const startInMiami = DateTime.fromISO(startLocal, { zone: MIAMI_TZ });
  const startUtc = startInMiami.toUTC().toJSDate();
  const endUtc = startInMiami.plus({ minutes: durationMinutes }).toUTC().toJSDate();

  if (!isWithinMiamiWindow(startUtc, endUtc)) {
    throw new Error("Blocage hors plage autorisee (07:00-20:00 Miami).");
  }

  return prisma.block.create({
    data: {
      startAt: startUtc,
      endAt: endUtc,
      reason
    }
  });
}

export async function deleteBlock(blockId: number) {
  return prisma.block.delete({ where: { id: blockId } });
}

export async function listUpcomingBookingsThisMonth() {
  const { endUtc } = monthBoundsUtc();
  return prisma.booking.findMany({
    where: {
      status: { not: "CANCELLED" },
      startAt: { gte: new Date(), lt: endUtc }
    },
    orderBy: { startAt: "asc" },
    include: { client: true }
  });
}

export async function countCancelledBookings() {
  return prisma.booking.count({ where: { status: "CANCELLED" } });
}

export async function listEmailLogs() {
  return prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" }
  });
}

export async function adminCancelBooking(id: number) {
  return cancelBooking(id);
}

export async function updateBookingStatus(id: number, status: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };

  if (status === "CANCELLED") {
    return cancelBooking(id);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status }
  });

  if (status === "CONFIRMED" && booking.status !== "CONFIRMED") {
    await sendBookingConfirmationEmail({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels"
    });
  }

  return updated;
}

export async function clientUsageThisMonth() {
  const { startUtc, endUtc } = monthBoundsUtc();
  const grouped = await prisma.booking.groupBy({
    by: ["clientId"],
    where: { status: { not: "CANCELLED" }, startAt: { gte: startUtc, lt: endUtc } },
    _count: { id: true }
  });
  return new Map(grouped.map((g) => [g.clientId, g._count.id]));
}

export async function updateBookingMode(id: number, mode: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };

  const updated = await prisma.booking.update({
    where: { id },
    data: { mode }
  });

  if (mode !== booking.mode) {
    await sendBookingUpdatedEmail({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels"
    });
  }

  return updated;
}

export async function adminRescheduleBooking(
  id: number,
  startLocal: string,
  reason?: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };
  if (booking.status === "CANCELLED") {
    return { error: "Ce rendez-vous est annulé." };
  }

  const startBrussels = DateTime.fromISO(startLocal, { zone: BRUSSELS_TZ });
  if (!startBrussels.isValid) {
    return { error: "Créneau invalide." };
  }

  const startUtc = startBrussels.toUTC().toJSDate();
  const endUtc = startBrussels.plus({ hours: 1 }).toUTC().toJSDate();

  const availability = await checkSlotAvailability(startUtc, endUtc, {
    excludeBookingId: booking.id
  });
  if (!availability.ok) {
    return { error: availability.error };
  }

  const oldStartAt = booking.startAt;
  const oldEndAt = booking.endAt;

  await prisma.booking.update({
    where: { id },
    data: {
      startAt: startUtc,
      endAt: endUtc,
      status: "CONFIRMED",
      rescheduleReason: reason ?? booking.rescheduleReason
    }
  });

  await sendBookingUpdatedEmail({
    bookingId: booking.id,
    clientName: booking.client.name,
    clientEmail: booking.client.email,
    startAt: startUtc,
    endAt: endUtc,
    oldStartAt,
    oldEndAt,
    timeZone: "Europe/Brussels"
  });

  return { ok: true };
}

