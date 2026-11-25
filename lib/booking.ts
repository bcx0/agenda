import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { addDays } from "date-fns";
import { DateTime } from "luxon";
import { BRUSSELS_TZ, formatInZone, formatSlotBothTZ, monthBoundsUtc } from "./time";
import { getSettings } from "./settings";
import { checkInterval, computeSlots, isBrusselsPeriodDate } from "./availability-engine.mjs";
import { loadAvailabilityData } from "./availability-data.mjs";
import { lockSchedule } from "./schedule-ops.mjs";
import {
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail
} from "./email/booking";
import { makePayloadFromBooking, sendMakeBookingWebhook } from "./makeWebhook";
import { pushBookingToGoogle, pushBlockToGoogle } from "./sync-engine";
// booking-limits.ts weekly cap removed — monthly quota is the sole limiter

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
  activeLocation: "MIAMI" | "BELGIUM";
  presentielLocation?: string;
  presentielNote?: string | null;
  /** Cause du blocage quand status === "blocked" (diagnostic admin). */
  blockReason?: string | null;
  /** Tout ce qui occupe le créneau, par priorité (admin uniquement). */
  blockers?: SlotBlocker[];
};

/** Élément qui occupe un créneau (cf. findBlockers, lib/availability-engine.mjs). */
export type SlotBlocker = {
  kind: "booking" | "manual_block" | "calendar_block" | "recurring";
  priority: number;
  label: string;
  bookingId?: number;
  overrideId?: number;
  blockId?: number;
  fromGoogle?: boolean;
  recurringBlockId?: number;
  occurrenceDate?: string;
  movedOccurrence?: boolean;
  clientId?: number | null;
};

type LocationPeriodRow = {
  id: number;
  startDate: Date;
  endDate: Date;
  note: string | null;
};

// Les périodes sont enregistrées en début/fin de journée À BRUXELLES puis
// converties en UTC (app/admin/actions.ts) : 14/12 00:00 Bruxelles devient
// 13/12 23:00 UTC. Il faut donc relire la date dans le fuseau de Bruxelles ;
// la lecture en UTC faisait commencer chaque période un jour trop tôt.
function isDateInBrusselsPeriod(day: DateTime, periods: LocationPeriodRow[]): boolean {
  const dayIso = day.toISODate();
  if (!dayIso) return false;
  return isBrusselsPeriodDate(dayIso, periods);
}

type SlotCheckOptions = { excludeBookingId?: number };

// ─── Disponibilités : moteur UNIQUE (lib/availability-engine.mjs) ─────────
// Avant le 25/11/2026, getAvailability() et checkSlotAvailability() avaient
// chacun leur propre calcul (et le bloc récurrent n'avait aucune exception
// possible) : un créneau pouvait être affiché puis refusé, et l'ancien créneau
// d'un RDV régulier déplacé restait bloqué pour toujours. Les deux passent
// désormais par les mêmes fonctions pures, sur les mêmes données.

export async function getQuotaStatus(clientId: number, targetDate?: Date) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client introuvable");
  const { startUtc, endUtc } = monthBoundsUtc(targetDate ?? new Date());
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

/** Cause lisible d'un blocage (admin uniquement). */
function blockerSummary(blockers: SlotBlocker[]): string | null {
  const first = blockers[0];
  return first ? first.label : null;
}

function toSlotView(
  slot: { start: Date; end: Date; status: AvailabilityStatus; activeLocation: "MIAMI" | "BELGIUM"; blockers: SlotBlocker[] },
  settings: { defaultMode: string; presentielLocation: string; presentielNote: string | null }
): SlotView {
  const mode: "VISIO" | "PRESENTIEL" =
    slot.activeLocation === "BELGIUM"
      ? "PRESENTIEL"
      : settings.defaultMode === "PRESENTIEL"
        ? "PRESENTIEL"
        : "VISIO";
  return {
    start: slot.start,
    end: slot.end,
    status: slot.status,
    label: formatInZone(slot.start, "EEEE dd MMM", BRUSSELS_TZ),
    ...formatSlotBothTZ(slot.start),
    mode,
    location: "MIAMI",
    activeLocation: slot.activeLocation,
    presentielLocation: settings.presentielLocation,
    presentielNote: settings.presentielNote,
    blockReason: slot.status === "blocked" ? blockerSummary(slot.blockers) : null,
    blockers: slot.status === "available" ? [] : slot.blockers
  };
}

/**
 * Créneaux des 365 prochains jours.
 * `audience: "public"` (pages client) retire la cause des blocages : elle
 * peut contenir le nom d'un autre client (note de série, réservation).
 */
export async function getAvailability(options: { audience?: "admin" | "public" } = {}) {
  const settings = await getSettings();
  const daysAhead = 365;
  const todayBrussels = DateTime.now().setZone(BRUSSELS_TZ).startOf("day");
  const rangeStart = todayBrussels.toUTC().toJSDate();
  const rangeEnd = todayBrussels.plus({ days: daysAhead + 1 }).toUTC().toJSDate();

  const data = await loadAvailabilityData(prisma, rangeStart, rangeEnd);
  const slots = computeSlots(data, { startDateIso: todayBrussels.toISODate() ?? "", days: daysAhead });

  return slots.map((slot) => {
    const view = toSlotView(slot as Parameters<typeof toSlotView>[0], settings);
    if (options.audience === "public") {
      return { ...view, blockReason: null, blockers: [] };
    }
    return view;
  });
}

/** Returns all LocationPeriod entries (for display in settings/calendar) */
export async function getLocationPeriods() {
  return prisma.locationPeriod.findMany({ orderBy: { startDate: "asc" } });
}

export async function checkSlotAvailability(
  startUtc: Date,
  endUtc: Date,
  options: SlotCheckOptions = {},
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  // Garde structurelle : durée nulle ou négative (fin avant début).
  if (endUtc.getTime() <= startUtc.getTime()) {
    return { ok: false as const, error: "Créneau invalide." };
  }
  const data = await loadAvailabilityData(
    db,
    new Date(startUtc.getTime() - 24 * 60 * 60 * 1000),
    new Date(endUtc.getTime() + 24 * 60 * 60 * 1000)
  );
  const result = checkInterval(startUtc, endUtc, data, options);
  if (!result.ok) {
    return { ok: false as const, error: result.error, code: result.code };
  }
  return { ok: true as const };
}

/**
 * Preloaded context to compute session modes without one DB roundtrip per slot
 * (used for bulk admin creation).
 */
export type ModeContext = {
  locationPeriods: LocationPeriodRow[];
  sessionModes: { startDate: Date; endDate: Date; mode: string }[];
  defaultMode: string;
};

export async function getModeContext(): Promise<ModeContext> {
  const [locationPeriods, sessionModes, settings] = await Promise.all([
    prisma.locationPeriod.findMany(),
    prisma.sessionMode.findMany({ orderBy: { startDate: "asc" } }),
    getSettings()
  ]);
  return { locationPeriods, sessionModes, defaultMode: settings.defaultMode };
}

/**
 * Session mode for a slot: Brussels period ⇒ PRESENTIEL, otherwise explicit
 * SessionMode range, otherwise the default from Settings.
 * Shared by client booking, reschedule AND admin creation so the stored mode
 * never diverges from what the UI displays.
 */
export function computeModeForSlotSync(
  startUtc: Date,
  ctx: ModeContext
): "VISIO" | "PRESENTIEL" {
  const slotDay = DateTime.fromJSDate(startUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
  if (isDateInBrusselsPeriod(slotDay, ctx.locationPeriods)) return "PRESENTIEL";

  const match = [...ctx.sessionModes]
    .reverse()
    .find((sm) => sm.startDate <= startUtc && sm.endDate >= startUtc);
  if (match?.mode === "PRESENTIEL") return "PRESENTIEL";
  if (match?.mode === "VISIO") return "VISIO";

  return ctx.defaultMode === "PRESENTIEL" ? "PRESENTIEL" : "VISIO";
}

export async function computeModeForSlot(startUtc: Date): Promise<"VISIO" | "PRESENTIEL"> {
  const ctx = await getModeContext();
  return computeModeForSlotSync(startUtc, ctx);
}

/**
 * Manage-token expiry: valid at least 7 days, and always until 24h after the
 * session itself — a booking made 3 weeks in advance keeps a working link.
 */
export function manageTokenExpiry(endUtc: Date): Date {
  const weekFromNow = addDays(new Date(), 7);
  const dayAfterBooking = addDays(endUtc, 1);
  return dayAfterBooking > weekFromNow ? dayAfterBooking : weekFromNow;
}

export async function bookSlot(clientId: number, startUtc: Date, endUtc: Date) {
  // Safety net: block bookings when admin has locked them
  const lockSettings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (lockSettings?.bookingLocked) {
    return { error: "Les réservations sont temporairement suspendues." };
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.isActive) {
    return { error: "Accès réservé aux clients sous contrat." };
  }

  // Monthly quota is enforced below via getQuotaStatus — no weekly cap needed

  // Clients cannot book less than 48 hours in advance
  const hoursUntilSlot = (startUtc.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilSlot < 48) {
    return {
      error: "Les réservations doivent être faites au moins 48h à l'avance."
    };
  }

  const availability = await checkSlotAvailability(startUtc, endUtc);
  if (!availability.ok) {
    return { error: availability.error };
  }

  const QUOTA_ERROR =
    "Quota mensuel atteint. Contactez Geoffrey si vous avez besoin d'un créneau supplémentaire.";

  // Fast pre-check on the MONTH OF THE BOOKING (recounted inside the transaction below)
  const { creditsPerMonth, creditsUsedThisMonth } = await getQuotaStatus(clientId, startUtc);
  if (creditsUsedThisMonth >= creditsPerMonth) {
    return { error: QUOTA_ERROR };
  }

  const bookingMode = await computeModeForSlot(startUtc);

  // Transaction + partial unique index (booking_confirmed_client_slot_unique)
  // prevent the double-booking race; quota is recounted inside so two parallel
  // requests cannot both pass the pre-check.
  const booking = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      // Verrou de la ligne client : sérialise les réservations SIMULTANÉES du
      // même client. Sans lui, deux requêtes parallèles comptaient chacune le
      // quota AVANT le commit de l'autre et le dépassaient (prouvé par le
      // harnais de tests : quota=1, 2 résas parallèles → 2 CONFIRMED).
      // FOR UPDATE relâché en fin de transaction — compatible pgbouncer
      // (transaction pooling Supabase).
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId} FOR UPDATE`;
      // Verrou de l'agenda (le même que les actions admin sur les séries et
      // les disponibilités) : un créneau rebloqué par l'admin pendant la
      // réservation ne peut plus être réservé en même temps.
      await lockSchedule(tx);

      const conflict = await tx.booking.findFirst({
        where: {
          status: "CONFIRMED",
          startAt: { lt: endUtc },
          endAt: { gt: startUtc }
        }
      });
      if (conflict) {
        throw new Error("SLOT_TAKEN");
      }
      // Re-vérification complète dans la transaction (moteur unique).
      const recheck = await checkSlotAvailability(startUtc, endUtc, {}, tx);
      if (!recheck.ok) {
        throw new Error(recheck.code === "TAKEN" ? "SLOT_TAKEN" : "SLOT_UNAVAILABLE");
      }

      const { startUtc: monthStart, endUtc: monthEnd } = monthBoundsUtc(startUtc);
      const usedInMonth = await tx.booking.count({
        where: {
          clientId,
          status: { not: "CANCELLED" },
          startAt: { gte: monthStart, lt: monthEnd }
        }
      });
      if (usedInMonth >= creditsPerMonth) {
        throw new Error("QUOTA_REACHED");
      }

      return tx.booking.create({
        data: {
          clientId,
          startAt: startUtc,
          endAt: endUtc,
          status: "CONFIRMED",
          mode: bookingMode,
          manageToken: crypto.randomBytes(32).toString("hex"),
          manageTokenExpiresAt: manageTokenExpiry(endUtc),
          bookedBy: "client"
        }
      });
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message === "SLOT_TAKEN") return "SLOT_TAKEN" as const;
      if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") return "SLOT_UNAVAILABLE" as const;
      if (err instanceof Error && err.message === "QUOTA_REACHED") return "QUOTA_REACHED" as const;
      // Unique index violation (two truly simultaneous requests)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return "SLOT_TAKEN" as const;
      }
      throw err;
    });

  if (booking === "SLOT_TAKEN") {
    return { error: "Ce créneau vient d'être pris." };
  }
  if (booking === "SLOT_UNAVAILABLE") {
    return { error: "Ce créneau n'est plus disponible." };
  }
  if (booking === "QUOTA_REACHED") {
    return { error: QUOTA_ERROR };
  }
  pushBookingToGoogle(booking.id, "create").catch((err: unknown) =>
    console.error("[GoogleSync] Booking create failed:", err)
  );

  // NEXT_PUBLIC_APP_URL d'abord (APP_URL prod contenait un domaine erroné —
  // cf. lib/email/booking.ts buildAppLink).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  const manageUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/rdv/manage/${booking.manageToken}`
    : null;

  // Await email sending - fire-and-forget does not work reliably on Vercel serverless
  try {
    await sendBookingConfirmationEmail({
      bookingId: booking.id,
      clientName: client.name,
      clientEmail: client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels",
      manageUrl
    });
  } catch (err) {
    console.error("[Email] Confirmation send failed:", err);
  }

  void sendMakeBookingWebhook(
    makePayloadFromBooking({
      clientName: client.name,
      service: booking.mode,
      startAt: booking.startAt,
      endAt: booking.endAt
    })
  );

  return { booking };
}
export async function cancelBooking(bookingId: number, reason?: string) {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    // Mise à jour conditionnelle : si deux annulations arrivent en même
    // temps, elles lisent toutes deux CONFIRMED, mais une seule passe ici
    // (l'autre trouve count = 0) → un seul email et une seule suppression
    // Google au lieu de deux.
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelReason: reason ?? booking.cancelReason }
    });
    if (count === 0) {
      return { ok: true, alreadyCancelled: true } as const;
    }

    return { ok: true, booking } as const;
  });

  if ("error" in result) return result;

  // Déjà annulé (double-clic, deux onglets, requête rejouée) : réponse
  // idempotente. Avant, ce cas passait dans le check ci-dessous et JETAIT
  // "Booking manquant pour l'annulation." → erreur 500 pour l'utilisateur.
  if ("alreadyCancelled" in result && result.alreadyCancelled) {
    return result;
  }

  const booking = result.booking;

  if (!booking) {
    throw new Error("Booking manquant pour l'annulation.");
  }

  // Delete from Google Calendar first (await to ensure it completes before response)
  try {
    await pushBookingToGoogle(booking.id, "delete");
  } catch (err) {
    console.error("[GoogleSync] Booking delete failed:", err);
  }

  // Await email sending - fire-and-forget does not work reliably on Vercel serverless
  try {
    await sendBookingCancelledEmail({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels"
    });
  } catch (err) {
    console.error("[Email] Cancellation email failed:", err);
  }

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
  const expiresAt = manageTokenExpiry(booking.endAt);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      manageToken: token,
      manageTokenExpiresAt: expiresAt
    }
  });

  return { token: updated.manageToken! } as const;
}

