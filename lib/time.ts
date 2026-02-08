import { DateTime } from "luxon";

export const BRUSSELS_TZ = "Europe/Brussels";
export const MIAMI_TZ = "America/New_York";
const LOCALE = "fr";

export const MIAMI_WORK_START = 7;
// last slot starts at 20:00 Miami, so exclusive end boundary is 21:00
export const MIAMI_WORK_END = 20;
export const BRUSSELS_WORK_START = 9;
export const BRUSSELS_WORK_END = 18;

const toUtc = (date: Date | string) =>
  typeof date === "string"
    ? DateTime.fromISO(date, { zone: "utc" })
    : DateTime.fromJSDate(date, { zone: "utc" });

const fromZone = (date: Date | string, zone: string) =>
  typeof date === "string"
    ? DateTime.fromISO(date, { zone })
    : DateTime.fromJSDate(date, { zone });

export function utcToBrussels(date: Date) {
  return toUtc(date).setZone(BRUSSELS_TZ).toJSDate();
}

export function utcToMiami(date: Date) {
  return toUtc(date).setZone(MIAMI_TZ).toJSDate();
}

export function brusselsToUtc(date: Date | string) {
  return fromZone(date, BRUSSELS_TZ).toUTC().toJSDate();
}

export function miamiToUtc(date: Date | string) {
  return fromZone(date, MIAMI_TZ).toUTC().toJSDate();
}

export function formatInZone(date: Date, formatStr: string, timeZone = BRUSSELS_TZ) {
  return toUtc(date).setZone(timeZone).setLocale(LOCALE).toFormat(formatStr);
}

export function formatSlotBothTZ(dateUtc: Date) {
  const base = toUtc(dateUtc);
  return {
    brussels: base.setZone(BRUSSELS_TZ).toFormat("HH:mm"),
    miami: base.setZone(MIAMI_TZ).toFormat("HH:mm")
  };
}

export function monthBoundsUtc(base = new Date()) {
  const baseInBrussels = toUtc(base).setZone(BRUSSELS_TZ);
  const startUtc = baseInBrussels.startOf("month").toUTC().toJSDate();
  const endUtc = baseInBrussels.startOf("month").plus({ months: 1 }).toUTC().toJSDate();
  return { startUtc, endUtc };
}

export function buildSlots(daysAhead = 14, location: "MIAMI" | "BELGIUM" = "MIAMI") {
  const zone = location === "MIAMI" ? MIAMI_TZ : BRUSSELS_TZ;
  const startHour = location === "MIAMI" ? MIAMI_WORK_START : BRUSSELS_WORK_START;
  const endHour = location === "MIAMI" ? MIAMI_WORK_END + 1 : BRUSSELS_WORK_END + 1;

  const today = DateTime.now().setZone(zone).startOf("day");
  const slots: { start: Date; end: Date }[] = [];

  for (let i = 0; i <= daysAhead; i++) {
    const day = today.plus({ days: i });

    const dayStart = day.set({
      hour: startHour,
      minute: 0,
      second: 0,
      millisecond: 0
    });
    const dayEndExclusive = day.set({
      hour: endHour,
      minute: 0,
      second: 0,
      millisecond: 0
    });

    for (let cursor = dayStart; cursor < dayEndExclusive; cursor = cursor.plus({ hours: 1 })) {
      const end = cursor.plus({ hours: 1 });
      slots.push({ start: cursor.toUTC().toJSDate(), end: end.toUTC().toJSDate() });
    }
  }

  return slots;
}

export function isRecurringBlockedBrussels(dateUtc: Date) {
  const inBrussels = toUtc(dateUtc).setZone(BRUSSELS_TZ);
  return inBrussels.weekday === 1 && inBrussels.hour === 17;
}

export function isWithinMiamiWindow(startUtc: Date, endUtc: Date) {
  const startMiami = toUtc(startUtc).setZone(MIAMI_TZ);
  const endMiami = toUtc(endUtc).setZone(MIAMI_TZ);

  if (startMiami.toISODate() !== endMiami.toISODate()) return false;
  const startsInRange = startMiami.hour >= MIAMI_WORK_START && startMiami.hour <= MIAMI_WORK_END;
  const endsBeforeCutoff =
    endMiami.hour < MIAMI_WORK_END + 1 ||
    (endMiami.hour === MIAMI_WORK_END + 1 &&
      endMiami.minute === 0 &&
      endMiami.second === 0 &&
      endMiami.millisecond === 0);

  return startsInRange && endsBeforeCutoff;
}

export function isWithinBrusselsWindow(startUtc: Date, endUtc: Date) {
  const start = toUtc(startUtc).setZone(BRUSSELS_TZ);
  const end = toUtc(endUtc).setZone(BRUSSELS_TZ);
  if (start.toISODate() !== end.toISODate()) return false;
  const startsInRange = start.hour >= BRUSSELS_WORK_START && start.hour <= BRUSSELS_WORK_END;
  const endsBeforeCutoff =
    end.hour < BRUSSELS_WORK_END + 1 ||
    (end.hour === BRUSSELS_WORK_END + 1 &&
      end.minute === 0 &&
      end.second === 0 &&
      end.millisecond === 0);
  return startsInRange && endsBeforeCutoff;
}
