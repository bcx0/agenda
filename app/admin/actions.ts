"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DateTime } from "luxon";
import {
  adminCancelBooking,
  adminRescheduleBooking,
  createAvailabilityOverride,
  createAvailabilityRule,
  createRecurringBlock,
  createBlock,
  createClient,
  deleteAvailabilityOverride,
  deleteAvailabilityRule,
  deleteRecurringBlock,
  deleteBlock,
  setClientActive,
  updateBookingStatus,
  updateCredits
} from "../../lib/admin";
import { checkAdminPassword } from "../../lib/auth";
import { clearAdminSession, getAdminSession, setAdminSession } from "../../lib/session";
import { BRUSSELS_TZ, MIAMI_WORK_START } from "../../lib/time";
import { updateBookingMode } from "../../lib/admin";
import { prisma } from "../../lib/prisma";

function assertAdmin() {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");
}

function parseTimeToMinutes(value: string) {
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function buildErrorUrl(base: string, message: string) {
  return base.includes("?")
    ? `${base}&error=${encodeURIComponent(message)}`
    : `${base}?error=${encodeURIComponent(message)}`;
}

function assertValidTimeRange(startTime: string, endTime: string, redirectTo: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || start >= end) {
    redirect(buildErrorUrl(redirectTo, "Plage horaire invalide"));
  }
}

function parseRanges(raw: string, redirectTo: string) {
  let ranges: { startTime: string; endTime: string }[] = [];
  try {
    ranges = JSON.parse(raw) as { startTime: string; endTime: string }[];
  } catch {
    redirect(buildErrorUrl(redirectTo, "Format des plages invalide"));
  }
  if (!Array.isArray(ranges) || ranges.length === 0) {
    redirect(buildErrorUrl(redirectTo, "Aucune plage horaire"));
  }
  ranges.forEach((range) => assertValidTimeRange(range.startTime, range.endTime, redirectTo));
  return ranges;
}

function parseRangesSafe(raw: string) {
  try {
    const ranges = JSON.parse(raw) as { startTime: string; endTime: string }[];
    if (!Array.isArray(ranges) || ranges.length === 0) {
      return { error: "Aucune plage horaire" } as const;
    }
    for (const range of ranges) {
      const start = parseTimeToMinutes(range.startTime);
      const end = parseTimeToMinutes(range.endTime);
      if (start === null || end === null || start >= end) {
        return { error: "Plage horaire invalide" } as const;
      }
    }
    return { ranges } as const;
  } catch {
    return { error: "Format des plages invalide" } as const;
  }
}

function timeInRanges(minutes: number, ranges: { startTime: string; endTime: string }[]) {
  return ranges.some((range) => {
    const start = parseTimeToMinutes(range.startTime);
    const end = parseTimeToMinutes(range.endTime);
    if (start === null || end === null) return false;
    return minutes >= start && minutes < end;
  });
}

export async function adminLoginAction(formData: FormData) {
  const password = formData.get("password")?.toString() ?? "";
  if (!checkAdminPassword(password)) {
    redirect("/admin?error=Mot%20de%20passe%20incorrect");
  }
  setAdminSession();
  redirect("/admin");
}

export async function adminLogoutAction() {
  clearAdminSession();
  redirect("/admin");
}

export async function addClientAction(formData: FormData) {
  assertAdmin();
  const email = formData.get("email")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const creditsRaw = formData.get("creditsPerMonth")?.toString().trim() ?? "";

  if (!email) redirect("/admin/clients?error=Email%20manquant");
  if (!z.string().email().safeParse(email).success) {
    redirect("/admin/clients?error=Email%20invalide");
  }
  if (!name) redirect("/admin/clients?error=Nom%20manquant");
  if (!password) redirect("/admin/clients?error=Mot%20de%20passe%20manquant");

  if (!creditsRaw) {
    redirect("/admin/clients?error=Credits%20mensuels%20manquants");
  }
  const creditsPerMonth = Number(creditsRaw);
  if (!Number.isFinite(creditsPerMonth) || creditsPerMonth < 0) {
    redirect("/admin/clients?error=Credits%20mensuels%20invalides%20(>=%200)");
  }

  const hashed = await bcrypt.hash(password, 10);
  try {
    await createClient({
      email: email.toLowerCase(),
      name,
      passwordHash: hashed,
      creditsPerMonth
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      redirect("/admin/clients?error=Champs%20invalides");
    }
    if (err && typeof err === "object" && "code" in err && "message" in err) {
      const code = String(err.code);
      const message = String(err.message);
      redirect(`/admin/clients?error=${encodeURIComponent(`Prisma ${code}: ${message}`)}`);
    }
    const message = err instanceof Error ? err.message : "Creation client impossible";
    redirect(`/admin/clients?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/clients");
}

export async function updateCreditsAction(formData: FormData) {
  assertAdmin();
  const clientId = Number(formData.get("clientId"));
  const credits = Number(formData.get("creditsPerMonth"));
  if (!clientId || !credits) redirect("/admin/clients?error=Valeurs%20invalides");
  await updateCredits(clientId, credits);
  revalidatePath("/admin/clients");
}

export async function toggleClientAction(formData: FormData) {
  assertAdmin();
  const clientId = Number(formData.get("clientId"));
  const active = formData.get("active") === "true";
  await setClientActive(clientId, active);
  revalidatePath("/admin/clients");
}

export async function createBlockAction(formData: FormData) {
  assertAdmin();
  let start = formData.get("start")?.toString() ?? "";
  const dayOnly = formData.get("day")?.toString();
  const duration = Number(formData.get("durationMinutes")) || 60;
  const reason = formData.get("reason")?.toString();
  if (!start && dayOnly) {
    start = `${dayOnly}T${MIAMI_WORK_START.toString().padStart(2, "0")}:00`;
  }
  if (!start) redirect("/admin/availability?error=Date%20manquante");
  try {
    await createBlock(start, duration, reason || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blocage impossible";
    redirect(`/admin/availability?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/availability");
}

export async function deleteBlockAction(formData: FormData) {
  assertAdmin();
  const blockId = Number(formData.get("blockId"));
  if (!blockId) redirect("/admin/availability?error=Blocage%20introuvable");
  await deleteBlock(blockId);
  revalidatePath("/admin/availability");
}

export async function setGeneralAvailabilityForDateAction(
  _prevState: any,
  formData: FormData
) {
  assertAdmin();
  const date = formData.get("date")?.toString() ?? "";
  const rangesRaw = formData.get("ranges")?.toString() ?? "[]";
  if (!date) {
    return { error: "Date manquante" } as const;
  }
  const parsed = parseRangesSafe(rangesRaw);
  if ("error" in parsed) {
    return { error: parsed.error } as const;
  }
  const ranges = parsed.ranges;

  const dayStart = DateTime.fromISO(date, { zone: BRUSSELS_TZ }).startOf("day");
  if (!dayStart.isValid) {
    return { error: "Date invalide" } as const;
  }
  const dayEnd = dayStart.plus({ days: 1 });

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: dayStart.toUTC().toJSDate(), lt: dayEnd.toUTC().toJSDate() }
    }
  });

  const invalidBooking = bookings.find((booking) => {
    const startBrussels = DateTime.fromJSDate(booking.startAt, { zone: "utc" }).setZone(
      BRUSSELS_TZ
    );
    const minutes = startBrussels.hour * 60 + startBrussels.minute;
    return !timeInRanges(minutes, ranges);
  });

  if (invalidBooking) {
    return {
      error: "Un rendez-vous existant sort des plages definies"
    } as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.availabilityOverride.deleteMany({
      where: {
        type: "OPEN",
        date: { gte: dayStart.toUTC().toJSDate(), lt: dayEnd.toUTC().toJSDate() }
      }
    });
    await tx.availabilityOverride.createMany({
      data: ranges.map((range) => ({
        date: dayStart.toUTC().toJSDate(),
        startTime: range.startTime,
        endTime: range.endTime,
        type: "OPEN"
      }))
    });
  });

  revalidatePath("/admin/availability");
  revalidatePath("/book");
  return { success: true, message: "Disponibilite du jour enregistree" } as const;
}

export async function deleteGeneralAvailabilityForDateAction(
  _prevState: any,
  formData: FormData
) {
  assertAdmin();
  const date = formData.get("date")?.toString() ?? "";
  if (!date) {
    return { error: "Date manquante" } as const;
  }
  const dayStart = DateTime.fromISO(date, { zone: BRUSSELS_TZ }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  await prisma.availabilityOverride.deleteMany({
    where: {
      type: "OPEN",
      date: { gte: dayStart.toUTC().toJSDate(), lt: dayEnd.toUTC().toJSDate() }
    }
  });
  revalidatePath("/admin/availability");
  revalidatePath("/book");
  return { success: true, message: "Disponibilite du jour supprimee" } as const;
}

export async function setGeneralRecurringForDayAction(
  _prevState: any,
  formData: FormData
) {
  assertAdmin();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const rangesRaw = formData.get("ranges")?.toString() ?? "[]";
  if (!dayOfWeek) {
    return { error: "Jour manquant" } as const;
  }
  const parsed = parseRangesSafe(rangesRaw);
  if ("error" in parsed) {
    return { error: parsed.error } as const;
  }
  const ranges = parsed.ranges;

  console.log("Saving recurring slots:", { dayOfWeek, ranges });

  const horizonStart = DateTime.now().setZone(BRUSSELS_TZ).startOf("day");
  const horizonEnd = horizonStart.plus({ days: 90 });
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: horizonStart.toUTC().toJSDate(), lt: horizonEnd.toUTC().toJSDate() }
    }
  });
  const invalidBooking = bookings.find((booking) => {
    const startBrussels = DateTime.fromJSDate(booking.startAt, { zone: "utc" }).setZone(
      BRUSSELS_TZ
    );
    if (startBrussels.weekday !== dayOfWeek) return false;
    const minutes = startBrussels.hour * 60 + startBrussels.minute;
    return !timeInRanges(minutes, ranges);
  });
  if (invalidBooking) {
    return {
      error: "Un rendez-vous existant sort des plages definies"
    } as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.availabilityRule.deleteMany({ where: { dayOfWeek } });
    await tx.availabilityRule.createMany({
      data: ranges.map((range) => ({
        dayOfWeek,
        startTime: range.startTime,
        endTime: range.endTime
      }))
    });
  });

  revalidatePath("/admin/availability");
  revalidatePath("/book");
  return { success: true, message: "Récurrence enregistrée" } as const;
}

export async function deleteGeneralRecurringForDayAction(
  _prevState: any,
  formData: FormData
) {
  assertAdmin();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  if (!dayOfWeek) {
    return { error: "Jour manquant" } as const;
  }
  await prisma.availabilityRule.deleteMany({ where: { dayOfWeek } });
  revalidatePath("/admin/availability");
  revalidatePath("/book");
  return { success: true, message: "Recurrence supprimee" } as const;
}

export async function createAvailabilityRuleAction(formData: FormData) {
  assertAdmin();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = formData.get("startTime")?.toString() ?? "";
  const endTime = formData.get("endTime")?.toString() ?? "";
  if (!dayOfWeek || !startTime || !endTime) {
    redirect("/admin/availability?error=Champs%20invalides");
  }
  assertValidTimeRange(startTime, endTime, "/admin/availability");
  await createAvailabilityRule(dayOfWeek, startTime, endTime);
  revalidatePath("/admin/availability");
}

export async function deleteAvailabilityRuleAction(formData: FormData) {
  assertAdmin();
  const ruleId = Number(formData.get("ruleId"));
  if (!ruleId) redirect("/admin/availability?error=Règle%20introuvable");
  await deleteAvailabilityRule(ruleId);
  revalidatePath("/admin/availability");
}

export async function createAvailabilityOverrideAction(formData: FormData) {
  assertAdmin();
  const dateStr = formData.get("date")?.toString() ?? "";
  const startTime = formData.get("startTime")?.toString() ?? "";
  const endTime = formData.get("endTime")?.toString() ?? "";
  const type = formData.get("type")?.toString() as "BLOCK" | "OPEN" | undefined;
  const note = formData.get("note")?.toString().trim() ?? "";
  if (!dateStr || !startTime || !endTime || !type) {
    redirect("/admin/availability?error=Champs%20invalides");
  }
  assertValidTimeRange(startTime, endTime, "/admin/availability");
  const date = DateTime.fromISO(dateStr, { zone: BRUSSELS_TZ }).startOf("day");
  if (!date.isValid) {
    redirect("/admin/availability?error=Date%20invalide");
  }
  await createAvailabilityOverride({
    date: date.toUTC().toJSDate(),
    startTime,
    endTime,
    type,
    note: note || undefined
  });
  revalidatePath("/admin/availability");
}

export async function deleteAvailabilityOverrideAction(formData: FormData) {
  assertAdmin();
  const overrideId = Number(formData.get("overrideId"));
  if (!overrideId) redirect("/admin/availability?error=Exception%20introuvable");
  await deleteAvailabilityOverride(overrideId);
  revalidatePath("/admin/availability");
}

export async function createRecurringBlockAction(formData: FormData) {
  assertAdmin();
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = formData.get("startTime")?.toString() ?? "";
  const endTime = formData.get("endTime")?.toString() ?? "";
  const clientIdRaw = formData.get("clientId")?.toString();
  const note = formData.get("note")?.toString().trim() ?? "";
  if (!dayOfWeek || !startTime || !endTime) {
    redirect("/admin/availability?error=Champs%20invalides");
  }
  assertValidTimeRange(startTime, endTime, "/admin/availability");
  const clientId = clientIdRaw ? Number(clientIdRaw) : null;
  await createRecurringBlock({
    dayOfWeek,
    startTime,
    endTime,
    clientId: clientId || null,
    note: note || undefined
  });
  revalidatePath("/admin/availability");
}

export async function deleteRecurringBlockAction(formData: FormData) {
  assertAdmin();
  const blockId = Number(formData.get("recurringBlockId"));
  if (!blockId) redirect("/admin/availability?error=Bloc%20introuvable");
  await deleteRecurringBlock(blockId);
  revalidatePath("/admin/availability");
}

export async function cancelBookingAction(formData: FormData) {
  assertAdmin();
  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) redirect("/admin/bookings?error=Reservation%20introuvable");
  const result = await adminCancelBooking(bookingId);
  if (result && "error" in result && result.error) {
    redirect(`/admin/bookings?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/admin/bookings");
}

export async function adminRescheduleBookingAction(formData: FormData) {
  assertAdmin();
  const bookingId = Number(formData.get("bookingId"));
  const start = formData.get("start")?.toString() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (!bookingId || !start) {
    redirect("/admin/bookings?error=Champs%20invalides");
  }
  const result = await adminRescheduleBooking(bookingId, start, reason || undefined);
  if (result && "error" in result && result.error) {
    redirect(`/admin/bookings?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/admin/bookings");
}

export async function setBookingStatusAction(formData: FormData) {
  assertAdmin();
  const bookingId = Number(formData.get("bookingId"));
  const status = formData.get("status")?.toString();
  if (!bookingId || !status) redirect("/admin/bookings?error=Statut%20manquant");
  await updateBookingStatus(bookingId, status);
  revalidatePath("/admin/bookings");
}

export async function updateBookingModeAction(formData: FormData) {
  assertAdmin();
  const bookingId = Number(formData.get("bookingId"));
  const mode = formData.get("mode")?.toString();
  if (!bookingId || !mode) redirect("/admin/bookings?error=Mode%20manquant");
  await updateBookingMode(bookingId, mode);
  revalidatePath("/admin/bookings");
}

const ADMIN_BLOCK_NOTE_PREFIX = "[ADMIN_BLOCK]";

export async function blockDateForClientAction(formData: FormData) {
  assertAdmin();
  const clientId = Number(formData.get("clientId"));
  const date = formData.get("date")?.toString() ?? "";
  const startTime = formData.get("startTime")?.toString() ?? "";
  const endTime = formData.get("endTime")?.toString() ?? "";
  const note = formData.get("note")?.toString().trim() ?? "";

  if (!clientId || !date || !startTime || !endTime) {
    redirect("/admin/availability?tab=single-block&error=Champs%20invalides");
  }

  assertValidTimeRange(startTime, endTime, "/admin/availability?tab=single-block");

  const startBrussels = DateTime.fromISO(`${date}T${startTime}`, { zone: BRUSSELS_TZ });
  const endBrussels = DateTime.fromISO(`${date}T${endTime}`, { zone: BRUSSELS_TZ });
  if (!startBrussels.isValid || !endBrussels.isValid || endBrussels <= startBrussels) {
    redirect("/admin/availability?tab=single-block&error=Date%20ou%20horaire%20invalide");
  }

  const startAt = startBrussels.toUTC().toJSDate();
  const endAt = endBrussels.toUTC().toJSDate();

  const overlap = await prisma.booking.findFirst({
    where: {
      status: { not: "CANCELLED" },
      startAt: { lt: endAt },
      endAt: { gt: startAt }
    },
    select: { id: true }
  });

  if (overlap) {
    redirect("/admin/availability?tab=single-block&error=Conflit%20avec%20un%20rendez-vous%20existant");
  }

  await prisma.booking.create({
    data: {
      clientId,
      startAt,
      endAt,
      status: "CONFIRMED",
      mode: "VISIO",
      rescheduleReason: note
        ? `${ADMIN_BLOCK_NOTE_PREFIX} ${note}`
        : ADMIN_BLOCK_NOTE_PREFIX
    }
  });

  revalidatePath("/admin/availability");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/clients");
  redirect("/admin/availability?tab=single-block&success=Cr%C3%A9neau%20bloqu%C3%A9%20avec%20succ%C3%A8s");
}

export async function cancelBlockedDateAction(formData: FormData) {
  assertAdmin();
  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) {
    redirect("/admin/availability?tab=single-block&error=Rendez-vous%20introuvable");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { rescheduleReason: true }
  });

  if (!booking?.rescheduleReason?.startsWith(ADMIN_BLOCK_NOTE_PREFIX)) {
    redirect("/admin/availability?tab=single-block&error=Ce%20cr%C3%A9neau%20n%27est%20pas%20g%C3%A9r%C3%A9%20ici");
  }

  await adminCancelBooking(bookingId);
  revalidatePath("/admin/availability");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/clients");
  redirect("/admin/availability?tab=single-block&success=Cr%C3%A9neau%20annul%C3%A9");
}
