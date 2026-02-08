import { prisma } from "./prisma";
import crypto from "crypto";
import { addDays } from "date-fns";
import { DateTime } from "luxon";
import {
  BRUSSELS_TZ,
  BRUSSELS_WORK_START,
  BRUSSELS_WORK_END,
  MIAMI_WORK_START,
  MIAMI_WORK_END,
  formatInZone,
  formatSlotBothTZ,
  isWithinBrusselsWindow,
  isWithinMiamiWindow,
  monthBoundsUtc
} from "./time";
import { getSettings } from "./settings";
import {
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail
} from "./email/booking";

type AvailabilityStatus = "available" | "booked" | "blocked";

export type SlotView = {
  start: Date;
  end: Date;
  status: AvailabilityStatus;
  label: string;
  brussels: string;
  miami: string;
  mode: "VISIO" | "PRESENTIEL";
  location: "MIAMI" | "BELGIUM";
  presentielLocation?: string;
  presentielNote?: string | null;
};

type AvailabilityRuleRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type AvailabilityOverrideRow = {
  date: Date;
  startTime: string;
  endTime: string;
  type: "BLOCK" | "OPEN";
};

type RecurringBlockRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  clientId: number | null;
  note: string | null;
};

type SlotCheckOptions = { excludeBookingId?: number };

function parseTimeToMinutes(value: string) {
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function buildFallbackRules(location: "MIAMI" | "BELGIUM"): AvailabilityRuleRow[] {
  const start = location === "MIAMI" ? MIAMI_WORK_START : BRUSSELS_WORK_START;
  const end = location === "MIAMI" ? MIAMI_WORK_END + 1 : BRUSSELS_WORK_END + 1;
  return Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1,
    startTime: `${start.toString().padStart(2, "0")}:00`,
    endTime: `${end.toString().padStart(2, "0")}:00`
  }));
}

function sameBrusselsDate(date: Date, day: DateTime) {
  return (
    DateTime.fromJSDate(date, { zone: "utc" }).setZone(BRUSSELS_TZ).toISODate() ===
    day.toISODate()
  );
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function slotMinutesInBrussels(startUtc: Date, endUtc: Date) {
  const startBrussels = DateTime.fromJSDate(startUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
  const endBrussels = DateTime.fromJSDate(endUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
  if (startBrussels.toISODate() !== endBrussels.toISODate()) return null;
  return {
    start: startBrussels.hour * 60 + startBrussels.minute,
    end: endBrussels.hour * 60 + endBrussels.minute,
    day: startBrussels
  };
}

function slotWithinRule(minutes: { start: number; end: number }, rule: AvailabilityRuleRow) {
  const ruleStart = parseTimeToMinutes(rule.startTime);
  const ruleEnd = parseTimeToMinutes(rule.endTime);
  if (ruleStart === null || ruleEnd === null) return false;
  return minutes.start >= ruleStart && minutes.end <= ruleEnd;
}


function slotWithinOverride(
  minutes: { start: number; end: number },
  override: AvailabilityOverrideRow
) {
  const start = parseTimeToMinutes(override.startTime);
  const end = parseTimeToMinutes(override.endTime);
  if (start === null || end === null) return false;
  return minutes.start >= start && minutes.end <= end;
}

function slotOverlapsOverride(
  minutes: { start: number; end: number },
  override: AvailabilityOverrideRow
) {
  const start = parseTimeToMinutes(override.startTime);
  const end = parseTimeToMinutes(override.endTime);
  if (start === null || end === null) return false;
  return minutes.start < end && minutes.end > start;
}

function slotOverlapsRecurring(
  minutes: { start: number; end: number },
  block: RecurringBlockRow
) {
  const start = parseTimeToMinutes(block.startTime);
  const end = parseTimeToMinutes(block.endTime);
  if (start === null || end === null) return false;
  return minutes.start < end && minutes.end > start;
}

async function getAvailabilityData(rangeStart: Date, rangeEnd: Date) {
  const [rules, overrides, recurringBlocks, legacyBlocks, bookings] = await Promise.all([
    prisma.availabilityRule.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.availabilityOverride.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }]
    }),
    prisma.recurringBlock.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.block.findMany({
      where: { startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      orderBy: { startAt: "asc" }
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart }
      }
    })
  ]);
  return { rules, overrides, recurringBlocks, legacyBlocks, bookings };
}

export async function getQuotaStatus(clientId: number) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client introuvable");
  const { startUtc, endUtc } = monthBoundsUtc();
  const count = await prisma.booking.count({
    where: {
      clientId,
      status: { not: "CANCELLED" },
      startAt: { gte: startUtc, lt: endUtc }
    }
  });
  return {
    creditsPerMonth: client.creditsPerMonth,
  creditsUsedThisMonth: count
  };
}

export async function getAvailability() {
  const settings = await getSettings();
  const location = settings.location === "BELGIUM" ? "BELGIUM" : "MIAMI";
  const daysAhead = 365;
  const todayBrussels = DateTime.now().setZone(BRUSSELS_TZ).startOf("day");
  const rangeStart = todayBrussels.toUTC().toJSDate();
  const rangeEnd = todayBrussels.plus({ days: daysAhead + 1 }).toUTC().toJSDate();

  const { rules, overrides, recurringBlocks, legacyBlocks, bookings } =
    await getAvailabilityData(rangeStart, rangeEnd);

  console.log("Availability debug:", {
    rules: rules.length,
    overrides: overrides.length,
    recurringBlocks: recurringBlocks.length,
    legacyBlocks: legacyBlocks.length,
    bookings: bookings.length,
    rangeStart,
    rangeEnd
  });

  const hasRules = rules.length > 0;
  const hasOpenOverrides = overrides.some((override) => override.type === "OPEN");
  const useFallback = !(hasRules || hasOpenOverrides);
  const effectiveRules = hasRules ? rules : buildFallbackRules(location);
  const slots = new Map<string, { start: Date; end: Date }>();

  for (let i = 0; i <= daysAhead; i++) {
    const day = todayBrussels.plus({ days: i });
    const dayRules = effectiveRules.filter((rule) => rule.dayOfWeek === day.weekday);
    const openOverrides = overrides.filter(
      (override) => override.type === "OPEN" && sameBrusselsDate(override.date, day)
    );
    const baseRanges = hasRules
      ? dayRules
      : useFallback
      ? dayRules
      : [];
    const activeRanges = openOverrides.length ? openOverrides : baseRanges;

    if (dayRules.length || openOverrides.length) {
      console.log("Rules pour ce jour:", {
        day: day.toISODate(),
        dayRules,
        openOverrides
      });
    }

    const addSlotsFromRange = (startTime: string, endTime: string) => {
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) return;
      for (let cursor = startMinutes; cursor + 60 <= endMinutes; cursor += 60) {
        const start = day.set({
          hour: Math.floor(cursor / 60),
          minute: cursor % 60,
          second: 0,
          millisecond: 0
        });
        const end = start.plus({ minutes: 60 });
        const startUtc = start.toUTC().toJSDate();
        const endUtc = end.toUTC().toJSDate();
        const key = startUtc.toISOString();
        if (!slots.has(key)) {
          slots.set(key, { start: startUtc, end: endUtc });
        }
      }
    };

    activeRanges.forEach((range) => addSlotsFromRange(range.startTime, range.endTime));

    if (activeRanges.length) {
      console.log("Créneaux générés:", {
        day: day.toISODate(),
        activeRanges,
        slotsForDay: Array.from(slots.values()).filter((s) =>
          sameBrusselsDate(s.start, day)
        ).length
      });
    }
  }

  const slotEntries = Array.from(slots.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const slotViews = slotEntries.map<SlotView>((slot) => {
    const minutes = slotMinutesInBrussels(slot.start, slot.end);
    const day =
      minutes?.day ??
      DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(BRUSSELS_TZ);
    const dayOverrides = overrides.filter((override) => sameBrusselsDate(override.date, day));
    const blockOverrides = dayOverrides.filter((override) => override.type === "BLOCK");
    const dayRecurringBlocks = recurringBlocks.filter((block) => block.dayOfWeek === day.weekday);

    const isBlocked =
      (!!minutes &&
        (blockOverrides.some((override) => slotOverlapsOverride(minutes, override)) ||
          dayRecurringBlocks.some((block) => slotOverlapsRecurring(minutes, block)))) ||
      legacyBlocks.some((block) => overlaps(block.startAt, block.endAt, slot.start, slot.end));

    const isBooked = bookings.some((booking) =>
      overlaps(booking.startAt, booking.endAt, slot.start, slot.end)
    );

    const status: AvailabilityStatus = isBlocked || isBooked ? "blocked" : "available";

    const mode: "VISIO" | "PRESENTIEL" =
      settings.defaultMode === "PRESENTIEL" ? "PRESENTIEL" : "VISIO";

    return {
      start: slot.start,
      end: slot.end,
      status: isBooked ? "booked" : status,
      label: formatInZone(slot.start, "EEEE dd MMM", BRUSSELS_TZ),
      ...formatSlotBothTZ(slot.start),
      mode,
      location,
      presentielLocation: settings.presentielLocation,
      presentielNote: settings.presentielNote
    };
  });

  console.log("Réservations existantes:", bookings);
  console.log("Disponibles:", slotViews.filter((slot) => slot.status === "available").length);

  return slotViews;
}

export async function checkSlotAvailability(
  startUtc: Date,
  endUtc: Date,
  options: SlotCheckOptions = {}
) {
  const minutes = slotMinutesInBrussels(startUtc, endUtc);
  if (!minutes) {
    return { ok: false as const, error: "Créneau invalide." };
  }

  const settings = await getSettings();
  const location = settings.location === "BELGIUM" ? "BELGIUM" : "MIAMI";
  const dayStart = minutes.day.startOf("day").toUTC().toJSDate();
  const dayEnd = minutes.day.plus({ days: 1 }).startOf("day").toUTC().toJSDate();

  const [rules, overrides, recurringBlocks, legacyBlocks, conflicts] = await Promise.all([
    prisma.availabilityRule.findMany(),
    prisma.availabilityOverride.findMany({ where: { date: { gte: dayStart, lt: dayEnd } } }),
    prisma.recurringBlock.findMany({ where: { dayOfWeek: minutes.day.weekday } }),
    prisma.block.findMany({
      where: { startAt: { lt: endUtc }, endAt: { gt: startUtc } }
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        id: options.excludeBookingId ? { not: options.excludeBookingId } : undefined,
        startAt: { lt: endUtc },
        endAt: { gt: startUtc }
      }
    })
  ]);

  const hasRules = rules.length > 0;
  const dayRules = rules.filter((rule) => rule.dayOfWeek === minutes.day.weekday);
  const openOverrides = overrides.filter((override) => override.type === "OPEN");
  const hasOpenOverrides = openOverrides.length > 0;
  const useFallback = !(hasRules || hasOpenOverrides);
  const effectiveRules = hasRules
    ? dayRules
    : buildFallbackRules(location).filter((rule) => rule.dayOfWeek === minutes.day.weekday);
  const blockOverrides = overrides.filter((override) => override.type === "BLOCK");
  const inOpenOverride = openOverrides.some((override) => slotWithinOverride(minutes, override));

  const withinRule = hasOpenOverrides
    ? inOpenOverride
    : effectiveRules.some((rule) => slotWithinRule(minutes, rule));

  if (!withinRule) {
    return { ok: false as const, error: "Créneau hors disponibilités." };
  }

  const blocked =
    blockOverrides.some((override) => slotOverlapsOverride(minutes, override)) ||
    recurringBlocks.some((block) => slotOverlapsRecurring(minutes, block)) ||
    legacyBlocks.some((block) => overlaps(block.startAt, block.endAt, startUtc, endUtc));

  if (blocked) {
    return { ok: false as const, error: "Ce créneau est bloqué." };
  }

  if (conflicts.length > 0) {
    return { ok: false as const, error: "Ce créneau vient d'être pris." };
  }

  const withinWindow =
    location === "MIAMI"
      ? isWithinMiamiWindow(startUtc, endUtc)
      : isWithinBrusselsWindow(startUtc, endUtc);

  if (!hasRules && !withinWindow && useFallback && !inOpenOverride) {
    return { ok: false as const, error: "Créneau hors plage autorisée." };
  }

  return { ok: true as const };
}

export async function bookSlot(clientId: number, startUtc: Date, endUtc: Date) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.isActive) {
    return { error: "Acces reserve aux clients sous contrat." };
  }

  const settings = await getSettings();
  const location = settings.location === "BELGIUM" ? "BELGIUM" : "MIAMI";
  const availability = await checkSlotAvailability(startUtc, endUtc);
  if (!availability.ok) {
    return { error: availability.error };
  }

  const { creditsPerMonth, creditsUsedThisMonth } = await getQuotaStatus(clientId);
  if (creditsUsedThisMonth >= creditsPerMonth) {
    return {
      error:
        "Quota mensuel atteint. Contactez Geoffrey si vous avez besoin d'un creneau supplementaire."
    };
  }

  const booking = await prisma.booking.create({
    data: {
      clientId,
      startAt: startUtc,
      endAt: endUtc,
      status: "CONFIRMED",
      mode: settings.defaultMode,
      manageToken: crypto.randomBytes(32).toString("hex"),
      manageTokenExpiresAt: addDays(new Date(), 7)
    }
  });

  const appUrl = process.env.APP_URL;
  const manageUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/rdv/manage/${booking.manageToken}`
    : null;

  await sendBookingConfirmationEmail({
    bookingId: booking.id,
    clientName: client.name,
    clientEmail: client.email,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timeZone: "Europe/Brussels",
    manageUrl
  });

  return { booking };
}
export async function cancelBooking(bookingId: number, reason?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { client: true }
    });
    if (!booking) return { error: "Booking introuvable" } as const;

    if (booking.status === "CANCELLED") {
      return { ok: true, alreadyCancelled: true } as const;
    }

    if (booking.status !== "CONFIRMED") {
      return { error: "Annulation impossible pour ce statut." } as const;
    }

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelReason: reason ?? booking.cancelReason }
    });

    return { ok: true, booking } as const;
  });

  if ("error" in result) return result;
  const booking = result.booking;

  if (!booking) {
    throw new Error("Booking manquant pour l'annulation.");
  }

  await sendBookingCancelledEmail({
    bookingId: booking.id,
    clientName: booking.client.name,
    clientEmail: booking.client.email,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timeZone: "Europe/Brussels"
  });


  return result;
}

export async function getUpcomingBookingForClient(clientId: number) {
  return prisma.booking.findFirst({
    where: {
      clientId,
      startAt: { gte: new Date() },
      status: { not: "CANCELLED" }
    },
    orderBy: { startAt: "asc" }
  });
}

export async function ensureManageTokenForBooking(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId }
  });
  if (!booking) return { error: "Booking introuvable" } as const;

  const now = new Date();
  if (booking.manageToken && booking.manageTokenExpiresAt && booking.manageTokenExpiresAt > now) {
    return { token: booking.manageToken } as const;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = addDays(now, 7);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      manageToken: token,
      manageTokenExpiresAt: expiresAt
    }
  });

  return { token: updated.manageToken! } as const;
}
