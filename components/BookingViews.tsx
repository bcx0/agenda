"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { SlotView } from "../lib/booking";
import { MIAMI_TZ } from "../lib/time";
import { CalendarViewToggle, type ViewMode } from "./CalendarViewToggle";
import { DaySlotsPanel } from "./DaySlotsPanel";
import { MonthCalendar } from "./MonthCalendar";
import { WeekCalendar } from "./WeekCalendar";
import SlotButton from "./SlotButton";

type Props = {
  slots: SlotView[];
  quotaReached: boolean;
};

type DayGroup = {
  key: string;
  label: string;
  slots: SlotView[];
  date: DateTime;
};

export function BookingViews({ slots, quotaReached }: Props) {
  const normalizedSlots = useMemo(
    () =>
      slots.map((slot) => ({
        ...slot,
        start: new Date(slot.start),
        end: new Date(slot.end)
      })),
    [slots]
  );

  const dayMap = useMemo(() => groupSlotsByDay(normalizedSlots), [normalizedSlots]);
  const [view, setView] = useState<ViewMode>("month");
  const [monthFocus, setMonthFocus] = useState<DateTime>(
    DateTime.now().setZone(MIAMI_TZ).startOf("month")
  );
  const [weekStart, setWeekStart] = useState<DateTime>(
    DateTime.now().setZone(MIAMI_TZ).startOf("week").plus({ days: 1 })
  );
  const [selectedDay, setSelectedDay] = useState<DayGroup | null>(null);

  const orderedDayGroups = useMemo(
    () => Array.from(dayMap.values()).sort((a, b) => a.date.toMillis() - b.date.toMillis()),
    [dayMap]
  );

  const handleSelectDay = (day: DateTime) => {
    const key = day.setZone(MIAMI_TZ).toISODate() ?? day.toFormat("yyyy-LL-dd");
    const group = dayMap.get(key);
    setSelectedDay(
      group ?? {
        key,
        label: day.setLocale("fr").toFormat("EEEE dd MMMM"),
        slots: [],
        date: day
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <CalendarViewToggle value={view} onChange={setView} />
      </div>

      {view === "month" && (
        <MonthCalendar
          month={monthFocus}
          daySlots={new Map(Array.from(dayMap.entries()).map(([k, v]) => [k, v.slots]))}
          onChangeMonth={setMonthFocus}
          onSelectDay={(d) => {
            const inMiami = d.setZone(MIAMI_TZ);
            handleSelectDay(inMiami);
            setWeekStart(inMiami.startOf("week").plus({ days: 1 }));
          }}
        />
      )}

      {view === "week" && (
        <WeekCalendar
          weekStart={weekStart}
          daySlots={new Map(Array.from(dayMap.entries()).map(([k, v]) => [k, v.slots]))}
          quotaReached={quotaReached}
          onChangeWeek={(next) => {
            setWeekStart(next);
            setMonthFocus(next.setZone(MIAMI_TZ).startOf("month"));
          }}
        />
      )}

      {view === "list" && (
        <div className="space-y-6">
          {orderedDayGroups.map((group) => (
            <div key={group.key} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
                  {group.label}
                </h3>
                <span className="text-xs uppercase tracking-widest text-white/50">
                  (Brussels / Miami)
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {group.slots.map((slot) => {
                  return (
                    <SlotButton
                      key={slot.start.toISOString()}
                      startIso={slot.start.toISOString()}
                      brussels={slot.brussels}
                      miami={slot.miami}
                      mode={slot.mode as any}
                      location={slot.location as any}
                      presentielLocation={slot.presentielLocation}
                      presentielNote={slot.presentielNote}
                      status={slot.status}
                      quotaReached={quotaReached}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <DaySlotsPanel
        open={!!selectedDay}
        dateLabel={selectedDay?.label ?? ""}
        slots={selectedDay?.slots ?? []}
        quotaReached={quotaReached}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  );
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

