import { DateTime } from "luxon";
import { prisma } from "./prisma";
import { cancelBooking } from "./booking";
import { BRUSSELS_TZ } from "./time";
import { pushBookingToGoogle } from "./sync-engine";
import { isWithinSeriesPeriod, toIsoDateOnly } from "./availability-engine.mjs";

export const ADMIN_BLOCK_NOTE_PREFIX = "[ADMIN_BLOCK]";

function parseTimeToMinutes(value: string): number | null {
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

type SeriesRow = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeZone: string | null;
  clientId: number | null;
  startDate: Date | null;
  endDate: Date | null;
};

/**
 * Réservations À VENIR d'une série à partir d'un instant :
 *  - liées explicitement (Booking.recurringBlockId), y compris celles
 *    déplacées individuellement ;
 *  - anciennes réservations non liées créées par la série (préfixe
 *    [ADMIN_BLOCK], même client, même jour et mêmes heures dans le fuseau de
 *    la série, dans sa période) — même règle qu'avant le 25/11/2026.
 */
export async function findSeriesFutureBookings(
  series: SeriesRow,
  fromUtc: Date,
  options: { includeLinked?: boolean } = {}
): Promise<number[]> {
  const ids = new Set<number>();
  if (options.includeLinked !== false) {
    const linked = await prisma.booking.findMany({
      where: { recurringBlockId: series.id, status: "CONFIRMED", startAt: { gte: fromUtc } },
      select: { id: true }
    });
    linked.forEach((b: { id: number }) => ids.add(b.id));
  }

  if (series.clientId) {
    const startMinutes = parseTimeToMinutes(series.startTime);
    const endMinutes = parseTimeToMinutes(series.endTime);
    if (startMinutes !== null && endMinutes !== null) {
      const tz = series.timeZone ?? BRUSSELS_TZ;
      const period = { startDate: toIsoDateOnly(series.startDate), endDate: toIsoDateOnly(series.endDate) };
      const candidates = await prisma.booking.findMany({
        where: {
          clientId: series.clientId,
          recurringBlockId: null,
          status: "CONFIRMED",
          rescheduleReason: { startsWith: ADMIN_BLOCK_NOTE_PREFIX },
          startAt: { gte: fromUtc }
        },
        select: { id: true, startAt: true, endAt: true }
      });
      for (const booking of candidates) {
        const startInZone = DateTime.fromJSDate(booking.startAt, { zone: "utc" }).setZone(tz);
        const endInZone = DateTime.fromJSDate(booking.endAt, { zone: "utc" }).setZone(tz);
        if (
          startInZone.weekday === series.dayOfWeek &&
          startInZone.hour * 60 + startInZone.minute === startMinutes &&
          endInZone.hour * 60 + endInZone.minute === endMinutes &&
          isWithinSeriesPeriod(period, startInZone.toISODate() ?? "")
        ) {
          ids.add(booking.id);
        }
      }
    }
  }
  return Array.from(ids);
}

/**
 * Annule des réservations une par une (emails + suppression Google, comme
 * une annulation normale). Ne masque aucun échec : renvoie le détail.
 */
export async function cancelBookingsWithNotifications(ids: number[], reason: string) {
  const results = await Promise.allSettled(ids.map((id) => cancelBooking(id, reason)));
  const failed = results.filter(
    (r) => r.status === "rejected" || (r.status === "fulfilled" && "error" in r.value)
  ).length;
  return { cancelled: ids.length - failed, failed };
}

/**
 * Pousse vers Google des réservations modifiées en masse (série), dans un
 * budget de temps. Celles qui ne passent pas restent "pending" et sont
 * reprises par le cron de synchronisation (retryPendingUpdates).
 */
export async function pushBookingUpdates(ids: number[], budgetMs = 8000) {
  const started = Date.now();
  let pushed = 0;
  let failed = 0;
  for (let i = 0; i < ids.length && Date.now() - started < budgetMs; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map((id) => pushBookingToGoogle(id, "update")));
    pushed += results.filter((r) => r.status === "fulfilled").length;
    failed += results.filter((r) => r.status === "rejected").length;
  }
  return { pushed, failed, deferred: ids.length - pushed - failed };
}
