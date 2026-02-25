import { DateTime } from "luxon";
import { getAvailability, type SlotView } from "./booking";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "./time";

export type TimeSlot = {
  date: Date;
  startTime: string;
  endTime: string;
  timezone: "Brussels" | "Miami";
  mode: "ONLINE" | "ONSITE";
  location: "MIAMI" | "BELGIUM";
  isAvailable: boolean;
  bookingId?: number;
  start: Date;
  end: Date;
  status: SlotView["status"];
  label: string;
  brussels: string;
  miami: string;
  presentielLocation?: string;
  presentielNote?: string | null;
};

function sameBrusselsDay(slotDate: Date, targetDate: Date) {
  return (
    DateTime.fromJSDate(slotDate, { zone: "utc" }).setZone(BRUSSELS_TZ).toISODate() ===
    DateTime.fromJSDate(targetDate).setZone(BRUSSELS_TZ).toISODate()
  );
}

export async function getAvailableTimeSlots(date?: Date, _prisma?: unknown): Promise<TimeSlot[]> {
  const slots = await getAvailability();
  const filteredSlots = date ? slots.filter((slot) => sameBrusselsDay(slot.start, date)) : slots;

  return filteredSlots
    .map((slot) => {
      const mode: "ONLINE" | "ONSITE" = slot.mode === "PRESENTIEL" ? "ONSITE" : "ONLINE";
      return {
        date: slot.start,
        startTime: slot.brussels,
        endTime: formatInZone(slot.end, "HH:mm", BRUSSELS_TZ),
        timezone: "Brussels" as const,
        mode,
        location: slot.location,
        isAvailable: slot.status === "available",
        bookingId: undefined,
        start: slot.start,
        end: slot.end,
        status: slot.status,
        label: slot.label,
        brussels: slot.brussels,
        miami: slot.miami,
        presentielLocation: slot.presentielLocation,
        presentielNote: slot.presentielNote
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function convertBrusselsToMiami(brusselsTime: string, referenceDate = new Date()): string {
  const [hour, minute] = brusselsTime.split(":").map((value) => Number(value));
  const base = DateTime.fromJSDate(referenceDate)
    .setZone(BRUSSELS_TZ)
    .set({ hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0, second: 0, millisecond: 0 });
  const miami = base.setZone(MIAMI_TZ);
  const dayDiff = Math.round(miami.startOf("day").diff(base.startOf("day"), "days").days);
  if (dayDiff < 0) return `${miami.toFormat("HH:mm")} (jour précédent)`;
  if (dayDiff > 0) return `${miami.toFormat("HH:mm")} (jour suivant)`;
  return miami.toFormat("HH:mm");
}

export function formatTimeSlot(slot: Pick<TimeSlot, "startTime" | "date">): string {
  const miamiTime = convertBrusselsToMiami(slot.startTime, slot.date);
  return `${slot.startTime} (Brussels) / ${miamiTime} (Miami)`;
}
