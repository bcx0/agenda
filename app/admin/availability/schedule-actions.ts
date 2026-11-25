"use server";

/**
 * Actions admin « agenda » (25/11/2026) : ajouter une disponibilité,
 * libérer / rebloquer / déplacer / supprimer une occurrence de série,
 * modifier une série (cette occurrence, cette occurrence et les suivantes,
 * toute la série), borner une série, lever une indisponibilité.
 *
 * Toutes renvoient un état affiché tel quel dans l'interface :
 *   { ok: true, message } ou { ok: false, error }.
 * Aucune ne réussit en silence : la logique (lib/schedule-ops.mjs) vérifie
 * l'effet réel avant de valider, et chaque échec externe (Google, emails) est
 * signalé dans le message.
 */

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { prisma } from "../../../lib/prisma";
import { getAdminSession } from "../../../lib/session";
import { adminRescheduleBooking, deleteBlock } from "../../../lib/admin";
import {
  addAvailability,
  addManualBlock,
  endSeriesFrom,
  moveOccurrence,
  restoreOccurrence,
  setSeriesPeriod,
  skipOccurrence,
  updateSeries
} from "../../../lib/schedule-ops.mjs";
import {
  BRUSSELS_TZ,
  MIAMI_TZ,
  occurrenceInterval,
  toIsoDateOnly,
  toMinutes,
  wallTimeToUtc,
  weekdayOfIso
} from "../../../lib/availability-engine.mjs";
import {
  cancelBookingsWithNotifications,
  findSeriesFutureBookings,
  pushBookingUpdates
} from "../../../lib/series-bookings";

export type ScheduleActionState = { ok: true; message: string } | { ok: false; error: string } | null;

type OpsResult = { ok: boolean; message?: string; error?: string; [key: string]: unknown };

const SESSION_ERROR: ScheduleActionState = { ok: false, error: "Session admin expirée : reconnectez-vous." };

function revalidateAgenda() {
  revalidatePath("/admin/availability");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/book");
  revalidatePath("/manage");
}

function str(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? "";
}

function toState(result: OpsResult): ScheduleActionState {
  if (result.ok) return { ok: true, message: result.message ?? "Enregistré." };
  return { ok: false, error: result.error ?? "Action impossible." };
}

function seriesIdFrom(formData: FormData): number | null {
  const id = Number(formData.get("recurringBlockId"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function googleSuffix(push: { pushed: number; failed: number; deferred: number }, total: number): string {
  if (total === 0) return "";
  if (push.pushed === total) return ` Google Calendar mis à jour (${total}).`;
  return ` Google Calendar : ${push.pushed}/${total} mis à jour, le reste sera repoussé automatiquement par la synchronisation.`;
}

// ─── Ajouter un créneau ────────────────────────────────────────────────────

export async function addAvailabilitySlotAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const result = (await addAvailability(prisma, {
    dateIso: str(formData, "date"),
    startTime: str(formData, "startTime"),
    endTime: str(formData, "endTime")
  })) as OpsResult;
  if (result.ok) revalidateAgenda();
  return toState(result);
}

// ─── Occurrence précise ────────────────────────────────────────────────────

export async function releaseOccurrenceAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const recurringBlockId = seriesIdFrom(formData);
  if (!recurringBlockId) return { ok: false, error: "Série introuvable." };
  const result = (await skipOccurrence(prisma, {
    recurringBlockId,
    occurrenceDate: str(formData, "occurrenceDate"),
    note: "Libérée depuis l'agenda admin"
  })) as OpsResult;
  if (result.ok) revalidateAgenda();
  return toState(result);
}

export async function restoreOccurrenceAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const recurringBlockId = seriesIdFrom(formData);
  if (!recurringBlockId) return { ok: false, error: "Série introuvable." };
  const result = (await restoreOccurrence(prisma, {
    recurringBlockId,
    occurrenceDate: str(formData, "occurrenceDate")
  })) as OpsResult;
  if (result.ok) revalidateAgenda();
  return toState(result);
}

// ─── Indisponibilités explicites ───────────────────────────────────────────

export async function liftManualBlockAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const overrideId = Number(formData.get("overrideId"));
  if (!overrideId) return { ok: false, error: "Indisponibilité introuvable." };
  const override = await prisma.availabilityOverride.findUnique({ where: { id: overrideId } });
  if (!override || override.type !== "BLOCK") {
    return { ok: false, error: "Cette indisponibilité n'existe plus (déjà levée ?)." };
  }
  await prisma.availabilityOverride.delete({ where: { id: overrideId } });
  revalidateAgenda();
  return {
    ok: true,
    message: `Indisponibilité ${override.startTime}-${override.endTime} levée${override.note ? ` (${override.note})` : ""}.`
  };
}

export async function liftCalendarBlockAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const blockId = Number(formData.get("blockId"));
  if (!blockId) return { ok: false, error: "Blocage introuvable." };
  const result = await deleteBlock(blockId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateAgenda();
  return { ok: true, message: "Blocage levé (et retiré de Google Calendar s'il venait de là)." };
}

// ─── Déplacer : cette occurrence / et les suivantes / toute la série ──────

export async function moveOccurrenceAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const recurringBlockId = seriesIdFrom(formData);
  if (!recurringBlockId) return { ok: false, error: "Série introuvable." };
  const series = await prisma.recurringBlock.findUnique({ where: { id: recurringBlockId } });
  if (!series) return { ok: false, error: "Série introuvable (déjà supprimée ?)." };

  const scope = str(formData, "scope");
  const occurrenceDate = str(formData, "occurrenceDate");
  const newDate = str(formData, "newDate") || occurrenceDate;
  const newStartTime = str(formData, "newStartTime");
  const newEndTime = str(formData, "newEndTime");
  // Heures saisies dans le fuseau choisi (par défaut celui de la série).
  const zoneInput = str(formData, "timeZone");
  const zone =
    zoneInput === MIAMI_TZ || zoneInput === BRUSSELS_TZ
      ? zoneInput
      : series.timeZone === MIAMI_TZ
        ? MIAMI_TZ
        : BRUSSELS_TZ;
  const startMin = toMinutes(newStartTime);
  const endMin = toMinutes(newEndTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || startMin === null || endMin === null || endMin <= startMin) {
    return { ok: false, error: "Nouvel horaire invalide (date, début et fin requis, la fin après le début)." };
  }

  if (scope === "this") {
    const newStartUtc = wallTimeToUtc(newDate, startMin, zone);
    const newEndUtc = wallTimeToUtc(newDate, endMin, zone);
    if (!newStartUtc || !newEndUtc) return { ok: false, error: "Cette heure n'existe pas ce jour-là (changement d'heure)." };
    const keepOriginalBlocked = formData.get("keepOriginalBlocked") === "on";
    const result = (await moveOccurrence(prisma, {
      recurringBlockId,
      occurrenceDate,
      newStartUtc,
      newEndUtc,
      keepOriginalBlocked,
      note: "Déplacée depuis l'agenda admin"
    })) as OpsResult;

    if (!result.ok && result.code === "BOOKING_BACKED" && typeof result.bookingId === "number") {
      // Occurrence portée par une vraie réservation : on reprogramme LA
      // réservation (emails + Google) ; l'ancien créneau se libère seul.
      const startLocal = DateTime.fromJSDate(newStartUtc, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("yyyy-LL-dd'T'HH:mm");
      const resched = await adminRescheduleBooking(result.bookingId, startLocal, "Occurrence déplacée depuis la série");
      if ("error" in resched && resched.error) return { ok: false, error: resched.error };
      let extra = "";
      if (keepOriginalBlocked) {
        const original = occurrenceInterval(
          { ...series, startDate: toIsoDateOnly(series.startDate), endDate: toIsoDateOnly(series.endDate) },
          occurrenceDate
        );
        if (original) {
          const local = DateTime.fromJSDate(original.startUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
          const localEnd = DateTime.fromJSDate(original.endUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
          const block = (await addManualBlock(prisma, {
            dateIso: local.toISODate() ?? occurrenceDate,
            startTime: local.toFormat("HH:mm"),
            endTime: localEnd.toISODate() !== local.toISODate() ? "24:00" : localEnd.toFormat("HH:mm"),
            note: `Ancien créneau conservé bloqué — ${series.note ?? "série"}`
          })) as OpsResult;
          extra = block.ok ? " L'ancien créneau reste bloqué (blocage manuel)." : ` Attention : l'ancien créneau n'a pas pu être bloqué (${block.error}).`;
        }
      } else {
        extra = " L'ancien créneau est libéré.";
      }
      revalidateAgenda();
      const synced = "googleSynced" in resched && resched.googleSynced;
      return {
        ok: true,
        message: `Rendez-vous déplacé au ${DateTime.fromJSDate(newStartUtc, { zone: "utc" }).setZone(BRUSSELS_TZ).setLocale("fr").toFormat("cccc dd LLLL yyyy 'à' HH:mm")} (Bruxelles).${extra}${synced ? " Google Calendar mis à jour." : " Google Calendar sera mis à jour automatiquement à la prochaine synchronisation."}`
      };
    }
    if (result.ok) revalidateAgenda();
    return toState(result);
  }

  if (scope !== "following" && scope !== "all") return { ok: false, error: "Portée de modification inconnue." };
  const result = (await updateSeries(prisma, {
    recurringBlockId,
    scope,
    fromDate: occurrenceDate,
    dayOfWeek: weekdayOfIso(newDate),
    startTime: newStartTime,
    endTime: newEndTime,
    timeZone: zone
  })) as OpsResult & { movedBookingIds?: number[] };
  if (!result.ok) return toState(result);
  const moved = result.movedBookingIds ?? [];
  const push = await pushBookingUpdates(moved);
  revalidateAgenda();
  return {
    ok: true,
    message: `${result.message}${googleSuffix(push, moved.length)}${moved.length ? " Les clients concernés ne sont pas prévenus automatiquement." : ""}`
  };
}

// ─── Supprimer : cette occurrence / et les suivantes / toute la série ─────

export async function deleteOccurrenceAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const recurringBlockId = seriesIdFrom(formData);
  if (!recurringBlockId) return { ok: false, error: "Série introuvable." };
  const series = await prisma.recurringBlock.findUnique({ where: { id: recurringBlockId } });
  if (!series) return { ok: false, error: "Série introuvable (déjà supprimée ?)." };
  const scope = str(formData, "scope");
  const occurrenceDate = str(formData, "occurrenceDate");

  if (scope === "this") {
    const result = (await skipOccurrence(prisma, {
      recurringBlockId,
      occurrenceDate,
      cancelBooking: true,
      note: "Supprimée depuis l'agenda admin"
    })) as OpsResult;
    if (!result.ok) return toState(result);
    if (typeof result.bookingToCancel === "number") {
      const { failed } = await cancelBookingsWithNotifications([result.bookingToCancel], "Occurrence supprimée par l'admin");
      if (failed > 0) return { ok: false, error: "Le rendez-vous lié n'a pas pu être annulé. Rien n'a changé, réessayez." };
    }
    revalidateAgenda();
    return toState(result);
  }

  if (scope === "following") {
    const result = (await endSeriesFrom(prisma, { recurringBlockId, fromDate: occurrenceDate })) as OpsResult;
    if (!result.ok && result.code !== "WHOLE_SERIES") return toState(result);
    if (result.ok) {
      const startOfOccurrence = DateTime.fromISO(occurrenceDate, { zone: series.timeZone ?? BRUSSELS_TZ })
        .startOf("day")
        .toUTC()
        .toJSDate();
      const fromUtc = startOfOccurrence > new Date() ? startOfOccurrence : new Date();
      // Réservations liées aux occurrences arrêtées + anciennes réservations
      // non liées de la série à partir de cette date.
      const linkedIds = Array.isArray(result.bookingsToCancel) ? (result.bookingsToCancel as number[]) : [];
      const legacyIds = await findSeriesFutureBookings(series, fromUtc, { includeLinked: false });
      const ids = Array.from(new Set([...linkedIds, ...legacyIds]));
      const { failed } = await cancelBookingsWithNotifications(ids, "Annulé : série arrêtée par l'admin");
      revalidateAgenda();
      if (failed > 0) {
        return {
          ok: false,
          error: `${result.message} ${failed} rendez-vous n'ont pas pu être annulés : annulez-les depuis Rendez-vous.`
        };
      }
      return {
        ok: true,
        message: `${result.message}${ids.length ? ` ${ids.length} rendez-vous annulé${ids.length > 1 ? "s" : ""}.` : ""}`
      };
    }
    // Première occurrence de la série → suppression complète.
  }

  if (scope !== "following" && scope !== "all") return { ok: false, error: "Portée de suppression inconnue." };
  const ids = await findSeriesFutureBookings(series, new Date());
  const { failed } = await cancelBookingsWithNotifications(ids, "Annulé via suppression du bloc récurrent");
  if (failed > 0) {
    return { ok: false, error: `${failed} rendez-vous de la série n'ont pas pu être annulés : la série n'a pas été supprimée. Réessayez.` };
  }
  await prisma.recurringBlock.delete({ where: { id: recurringBlockId } });
  revalidateAgenda();
  return {
    ok: true,
    message: `Série supprimée${ids.length ? ` — ${ids.length} rendez-vous à venir annulé${ids.length > 1 ? "s" : ""}` : ""}. Le créneau est libre toutes les semaines.`
  };
}

// ─── Période de la série ───────────────────────────────────────────────────

export async function setSeriesPeriodAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  if (!getAdminSession()) return SESSION_ERROR;
  const recurringBlockId = seriesIdFrom(formData);
  if (!recurringBlockId) return { ok: false, error: "Série introuvable." };
  const result = (await setSeriesPeriod(prisma, {
    recurringBlockId,
    startDate: str(formData, "startDate") || null,
    endDate: str(formData, "endDate") || null,
    cancelOutside: formData.get("cancelOutside") === "on"
  })) as OpsResult & { bookingsToCancel?: number[] };
  if (!result.ok) return toState(result);
  const ids = result.bookingsToCancel ?? [];
  const { failed } = await cancelBookingsWithNotifications(ids, "Annulé : hors de la période de la série");
  revalidateAgenda();
  if (failed > 0) {
    return { ok: false, error: `${result.message} Attention : ${failed} rendez-vous n'ont pas pu être annulés, annulez-les depuis Rendez-vous.` };
  }
  return toState(result);
}
