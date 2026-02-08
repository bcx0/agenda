"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { DateTime } from "luxon";
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


export default function AdminGeneralAvailability({ slots, rules, overrides }: Props) {
  const normalized = useMemo(() => normalizeSlots(slots), [slots]);
  const dayMap = useMemo(() => groupSlotsByDay(normalized), [normalized]);
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

  const openDay = (day: DateTime) => {
    const inMiami = day.setZone(MIAMI_TZ);
    const key = inMiami.toISODate() ?? inMiami.toFormat("yyyy-LL-dd");
    const group = dayMap.get(key) ?? {
      key,
      label: inMiami.setLocale("fr").toFormat("EEEE dd MMMM"),
      slots: [],
      date: inMiami
    };
    setSelectedDay(group);

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

    setDateRanges(dayOverrides.length ? dayOverrides : [{ startTime: "09:00", endTime: "17:00" }]);
    setRecurringRanges(dayRules.length ? dayRules : [{ startTime: "09:00", endTime: "17:00" }]);

  };

  const bookedSlots = selectedDay
    ? selectedDay.slots.filter((slot) => slot.status === "booked")
    : [];

  return (
    <div className="space-y-6">
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
            daySlots={new Map(Array.from(dayMap.entries()).map(([k, v]) => [k, v.slots]))}
            onChangeMonth={setMonthFocus}
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

      {selectedDay ? (
        <div className="rounded-2xl border border-border bg-background-elevated p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/50">
                Date sélectionnée
              </div>
              <div className="text-lg font-semibold">{selectedDay.label}</div>
              <div className="text-sm text-white/60">
                Brussels: {selectedDay.date.setZone(BRUSSELS_TZ).toFormat("dd LLL yyyy")}
              </div>
            </div>
            <button
              type="button"
              className="text-sm text-white/60 hover:text-white"
              onClick={() => setSelectedDay(null)}
            >
              Fermer
            </button>
          </div>

          {bookedSlots.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Des créneaux sont déjà réservés ce jour. Ils resteront bloqués côté client.
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="text-sm font-semibold uppercase tracking-widest text-white/60">
                Disponibilité ponctuelle
              </div>
              <form action={dateAction} className="space-y-3">
                <input
                  type="hidden"
                  name="date"
                  value={selectedDay.date.setZone(BRUSSELS_TZ).toISODate() ?? ""}
                />
                <input type="hidden" name="ranges" value={toRangeJson(dateRanges)} />
                {dateState?.success ? (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    {dateState.message ?? "Enregistré."}
                  </div>
                ) : null}
                {dateState?.error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {dateState.error}
                  </div>
                ) : null}
                <div className="space-y-2">
                  {dateRanges.map((range, idx) => (
                    <div key={`date-${idx}`} className="flex items-center gap-2">
                      <input
                        type="time"
                        className="input"
                        value={range.startTime}
                        onChange={(e) => {
                          const next = [...dateRanges];
                          next[idx] = { ...next[idx], startTime: e.target.value };
                          setDateRanges(next);
                        }}
                      />
                      <input
                        type="time"
                        className="input"
                        value={range.endTime}
                        onChange={(e) => {
                          const next = [...dateRanges];
                          next[idx] = { ...next[idx], endTime: e.target.value };
                          setDateRanges(next);
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-md border border-border px-2 py-2 text-xs hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          const next = dateRanges.filter((_, i) => i !== idx);
                          setDateRanges(next.length ? next : [{ startTime: "", endTime: "" }]);
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-xs"
                    onClick={() =>
                      setDateRanges([...dateRanges, { startTime: "09:00", endTime: "17:00" }])
                    }
                  >
                    Ajouter une plage
                  </button>
                  <button type="submit" className="btn btn-primary text-xs">
                    Enregistrer ce jour
                  </button>
                </div>
              </form>
              <form action={deleteDateAction} className="space-y-2">
                <input
                  type="hidden"
                  name="date"
                  value={selectedDay.date.setZone(BRUSSELS_TZ).toISODate() ?? ""}
                />
                {deleteDateState?.success ? (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    {deleteDateState.message ?? "Supprimé."}
                  </div>
                ) : null}
                {deleteDateState?.error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {deleteDateState.error}
                  </div>
                ) : null}
                <button className="text-xs underline underline-offset-4 text-white/60 hover:text-white">
                  Supprimer la disponibilité du jour
                </button>
              </form>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-semibold uppercase tracking-widest text-white/60">
                Disponibilité récurrente ({dayNames[selectedDay.date.setZone(BRUSSELS_TZ).weekday - 1]})
              </div>
              <form action={recurringAction} className="space-y-3">
                <input
                  type="hidden"
                  name="dayOfWeek"
                  value={selectedDay.date.setZone(BRUSSELS_TZ).weekday}
                />
                <input type="hidden" name="ranges" value={toRangeJson(recurringRanges)} />
                {recurringState?.success ? (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    {recurringState.message ?? "Enregistré."}
                  </div>
                ) : null}
                {recurringState?.error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {recurringState.error}
                  </div>
                ) : null}
                <div className="space-y-2">
                  {recurringRanges.map((range, idx) => (
                    <div key={`rec-${idx}`} className="flex items-center gap-2">
                      <input
                        type="time"
                        className="input"
                        value={range.startTime}
                        onChange={(e) => {
                          const next = [...recurringRanges];
                          next[idx] = { ...next[idx], startTime: e.target.value };
                          setRecurringRanges(next);
                        }}
                      />
                      <input
                        type="time"
                        className="input"
                        value={range.endTime}
                        onChange={(e) => {
                          const next = [...recurringRanges];
                          next[idx] = { ...next[idx], endTime: e.target.value };
                          setRecurringRanges(next);
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-md border border-border px-2 py-2 text-xs hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          const next = recurringRanges.filter((_, i) => i !== idx);
                          setRecurringRanges(next.length ? next : [{ startTime: "", endTime: "" }]);
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-xs"
                    onClick={() =>
                      setRecurringRanges([
                        ...recurringRanges,
                        { startTime: "09:00", endTime: "17:00" }
                      ])
                    }
                  >
                    Ajouter une plage
                  </button>
                  <button type="submit" className="btn btn-primary text-xs">
                    Enregistrer la récurrence
                  </button>
                </div>
              </form>
              <form action={deleteRecurringAction} className="space-y-2">
                <input
                  type="hidden"
                  name="dayOfWeek"
                  value={selectedDay.date.setZone(BRUSSELS_TZ).weekday}
                />
                {deleteRecurringState?.success ? (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    {deleteRecurringState.message ?? "Supprimé."}
                  </div>
                ) : null}
                {deleteRecurringState?.error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {deleteRecurringState.error}
                  </div>
                ) : null}
                <button className="text-xs underline underline-offset-4 text-white/60 hover:text-white">
                  Supprimer la récurrence de ce jour
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}







