"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { DateTime } from "luxon";
import Link from "next/link";
import type { SlotView } from "../../../lib/booking";
import { BRUSSELS_TZ, MIAMI_TZ } from "../../../lib/time";
import { CalendarViewToggle, type ViewMode } from "../../../components/CalendarViewToggle";
import { MonthCalendar } from "../../../components/MonthCalendar";
import {
  setGeneralAvailabilityForDateAction,
  setGeneralRecurringForDayAction,
  deleteGeneralAvailabilityForDateAction,
  deleteGeneralRecurringForDayAction
} from "../actions";

type AvailabilityRule = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type AvailabilityOverride = {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  type: "OPEN";
};

type Range = { startTime: string; endTime: string };

type DayGroup = {
  key: string;
  label: string;
  slots: SlotView[];
  date: DateTime;
};

type Props = {
  slots: SlotView[];
  bookings: {
    id: number;
    startAt: Date | string;
    endAt: Date | string;
    client: { id: number; name: string };
  }[];
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
};

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function normalizeSlots(slots: SlotView[]) {
  return slots.map((slot) => ({
    ...slot,
    start: new Date(slot.start),
    end: new Date(slot.end)
  }));
}

function groupSlotsByDay(slots: SlotView[]): Map<string, DayGroup> {
  const map = new Map<string, DayGroup>();
  slots.forEach((slot) => {
    const day = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(MIAMI_TZ);
    const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: day.setLocale("fr").toFormat("EEEE dd MMMM"),
        slots: [],
        date: day
      });
    }
    map.get(key)?.slots.push(slot);
  });
  return map;
}

function toRangeJson(ranges: Range[]) {
  return JSON.stringify(
    ranges.filter((range) => range.startTime && range.endTime)
  );
}


export default function AdminGeneralAvailability({ slots, bookings, rules, overrides }: Props) {
  const normalized = useMemo(() => normalizeSlots(slots), [slots]);
  const dayMap = useMemo(() => groupSlotsByDay(normalized), [normalized]);
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("month");
  const [monthFocus, setMonthFocus] = useState<DateTime>(
    DateTime.now().setZone(MIAMI_TZ).startOf("month")
  );
  const [weekStart, setWeekStart] = useState<DateTime>(
    DateTime.now().setZone(MIAMI_TZ).startOf("week").plus({ days: 1 })
  );
  const [selectedDay, setSelectedDay] = useState<DayGroup | null>(null);
  const [dateRanges, setDateRanges] = useState<Range[]>([]);
  const [recurringRanges, setRecurringRanges] = useState<Range[]>([]);
  const [recurringState, recurringAction] = useFormState(
    setGeneralRecurringForDayAction,
    null
  );
  const [dateState, dateAction] = useFormState(setGeneralAvailabilityForDateAction, null);
  const [deleteDateState, deleteDateAction] = useFormState(
    deleteGeneralAvailabilityForDateAction,
    null
  );
  const [deleteRecurringState, deleteRecurringAction] = useFormState(
    deleteGeneralRecurringForDayAction,
    null
  );

  const orderedDayGroups = useMemo(
    () => Array.from(dayMap.values()).sort((a, b) => a.date.toMillis() - b.date.toMillis()),
    [dayMap]
  );
  const daySlotsMap = useMemo(
    () => new Map(Array.from(dayMap.entries()).map(([k, v]) => [k, v.slots])),
    [dayMap]
  );

  const openDay = (day: DateTime) => {
    const inMiami = day.setZone(MIAMI_TZ);
    const key = inMiami.toISODate() ?? inMiami.toFormat("yyyy-LL-dd");
    const group = dayMap.get(key) ?? {
      key,
      label: inMiami.setLocale("fr").toFormat("EEEE dd MMMM"),
      slots: [],
      date: inMiami
    };
    startTransition(() => {
      setSelectedDay(group);
    });

    const brusselsDay = inMiami.setZone(BRUSSELS_TZ);
    const dayKey = brusselsDay.toISODate() ?? brusselsDay.toFormat("yyyy-LL-dd");
    const dayOfWeek = brusselsDay.weekday;

    const dayOverrides = overrides
      .filter(
        (o) =>
          (DateTime.fromISO(o.date).setZone(BRUSSELS_TZ).toISODate() ??
            DateTime.fromISO(o.date).setZone(BRUSSELS_TZ).toFormat("yyyy-LL-dd")) === dayKey
      )
      .map((o) => ({ startTime: o.startTime, endTime: o.endTime }));
    const dayRules = rules
      .filter((r) => r.dayOfWeek === dayOfWeek)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));

    startTransition(() => {
      setDateRanges(dayOverrides.length ? dayOverrides : [{ startTime: "09:00", endTime: "17:00" }]);
      setRecurringRanges(dayRules.length ? dayRules : [{ startTime: "09:00", endTime: "17:00" }]);
    });

  };

  const bookedSlots = selectedDay
    ? selectedDay.slots.filter((slot) => slot.status === "booked")
    : [];
  const availabilitiesForDay = selectedDay
    ? selectedDay.slots.filter((slot) => slot.status === "available")
    : [];
  const bookingsForDay = useMemo(() => {
    if (!selectedDay) return [];
    return bookings
      .map((booking) => ({
        ...booking,
        startDate: new Date(booking.startAt),
        endDate: new Date(booking.endAt)
      }))
      .filter((booking) => {
        const dayKey =
          DateTime.fromJSDate(booking.startDate, { zone: "utc" }).setZone(MIAMI_TZ).toISODate() ??
          DateTime.fromJSDate(booking.startDate, { zone: "utc" })
            .setZone(MIAMI_TZ)
            .toFormat("yyyy-LL-dd");
        return dayKey === selectedDay.key;
      });
  }, [bookings, selectedDay]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <div className="rounded-2xl border border-border bg-background-elevated p-6">
        <div className="flex items-center justify-between">
          <CalendarViewToggle value={view} onChange={setView} />
          <span className="text-xs uppercase tracking-widest text-white/50">
            Brussels / Miami
          </span>
        </div>

        {view === "month" && (
          <MonthCalendar
            month={monthFocus}
            daySlots={daySlotsMap}
            onChangeMonth={setMonthFocus}
            allowEmptySelection={true}
            selectedDayKey={selectedDay?.key ?? null}
            onSelectDay={(d) => {
              openDay(d);
              const inMiami = d.setZone(MIAMI_TZ);
              setWeekStart(inMiami.startOf("week").plus({ days: 1 }));
            }}
          />
        )}

        {view === "week" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setWeekStart(weekStart.minus({ weeks: 1 }))}
                className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
              >
                {"<"}
              </button>
              <div className="text-lg font-semibold flex-1 text-center">
                {weekStart.setLocale("fr").toFormat("dd LLL")} -{" "}
                {weekStart.plus({ days: 6 }).setLocale("fr").toFormat("dd LLL")}
              </div>
              <button
                type="button"
                onClick={() => setWeekStart(weekStart.plus({ weeks: 1 }))}
                className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
              >
                {">"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setWeekStart(DateTime.now().setZone(MIAMI_TZ).startOf("week").plus({ days: 1 }))
                }
                className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
              >
                Aujourd&apos;hui
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => i).map((i) => {
                const day = weekStart.plus({ days: i });
                const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
                const slotsForDay = [...(dayMap.get(key)?.slots ?? [])].sort(
                  (a, b) => a.start.getTime() - b.start.getTime()
                );
                const label = `${dayNames[i]} ${day.setLocale("fr").toFormat("dd MMM")}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openDay(day)}
                    className="space-y-2 rounded-xl border border-border bg-background-elevated p-3 text-left"
                  >
                    <div className="flex items-center justify-between text-sm font-semibold text-white">
                      <span>{label}</span>
                    </div>
                    {slotsForDay.length === 0 ? (
                      <div className="text-xs text-white/50">Aucun créneau</div>
                    ) : (
                      <div className="space-y-2">
                        {slotsForDay.map((slot) => (
                          <div
                            key={slot.start.toISOString()}
                            className="rounded-xl border border-border px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span>{slot.brussels} (Brussels)</span>
                              <span className="text-[10px] uppercase tracking-widest text-white/40">
                                {slot.status}
                              </span>
                            </div>
                            <div className="text-white/60">{slot.miami} (Miami)</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="space-y-6">
            {orderedDayGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => openDay(group.date)}
                className="w-full space-y-3 rounded-xl border border-border bg-background-elevated p-4 text-left"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
                    {group.label}
                  </h3>
                  <span className="text-xs uppercase tracking-widest text-white/50">
                    Brussels / Miami
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {group.slots.map((slot) => (
                    <div
                      key={slot.start.toISOString()}
                      className="rounded-xl border border-border px-3 py-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span>{slot.brussels} (Brussels)</span>
                        <span className="text-[10px] uppercase tracking-widest text-white/40">
                          {slot.status}
                        </span>
                      </div>
                      <div className="text-white/60">{slot.miami} (Miami)</div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-border bg-background-elevated p-6 lg:sticky lg:top-6">
          {selectedDay ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Récapitulatif du {selectedDay.label}</h3>
                  <p className="text-sm text-white/60">
                    Brussels: {selectedDay.date.setZone(BRUSSELS_TZ).toFormat("dd LLL yyyy")}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-white/60 hover:text-white"
                  onClick={() => setSelectedDay(null)}
                >
                  Fermer
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-[#C8A060]">
                  Disponibilités
                </h4>
                {availabilitiesForDay.length > 0 ? (
                  <div className="space-y-2">
                    {availabilitiesForDay.map((slot) => (
                      <div
                        key={slot.start.toISOString()}
                        className="rounded-lg border border-[#C8A060] bg-[#1A1A1A] px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">{slot.brussels} (Brussels)</p>
                        <p className="text-xs text-white/70">{slot.miami} (Miami)</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/50">Aucune disponibilité</p>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-[#C8A060]">
                  Réservations
                </h4>
                {bookingsForDay.length > 0 ? (
                  <div className="space-y-2">
                    {bookingsForDay.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-green-600 bg-[#1A1A1A] px-3 py-2 text-sm"
                      >
                        <div className="flex-1">
                          <p className="font-semibold">{booking.client.name}</p>
                          <p className="text-xs text-white/70">
                            {DateTime.fromJSDate(booking.startDate, { zone: "utc" })
                              .setZone(BRUSSELS_TZ)
                              .toFormat("HH:mm")}{" "}
                            -{" "}
                            {DateTime.fromJSDate(booking.endDate, { zone: "utc" })
                              .setZone(BRUSSELS_TZ)
                              .toFormat("HH:mm")}{" "}
                            (Brussels)
                          </p>
                          <p className="text-xs text-white/60">
                            {DateTime.fromJSDate(booking.startDate, { zone: "utc" })
                              .setZone(MIAMI_TZ)
                              .toFormat("HH:mm")}{" "}
                            -{" "}
                            {DateTime.fromJSDate(booking.endDate, { zone: "utc" })
                              .setZone(MIAMI_TZ)
                              .toFormat("HH:mm")}{" "}
                            (Miami)
                          </p>
                        </div>
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="whitespace-nowrap text-sm font-medium text-[#C8A060] transition-colors hover:text-[#E8D7BE]"
                        >
                          Voir →
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/50">Aucune réservation</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[240px] items-center justify-center text-center text-white/50">
              Cliquez sur un jour du calendrier pour voir le récapitulatif.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}







