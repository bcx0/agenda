"use client";

import { memo, useMemo } from "react";
import { DateTime } from "luxon";
import SlotButton from "./SlotButton";
import type { SlotView } from "../lib/booking";
import { MIAMI_TZ } from "../lib/time";

type Props = {
  weekStart: DateTime;
  daySlots: Map<string, SlotView[]>;
  quotaReached: boolean;
  onChangeWeek: (next: DateTime) => void;
};

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function WeekCalendarComponent({ weekStart, daySlots, quotaReached, onChangeWeek }: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart]
  );
  const weekLabel = useMemo(
    () =>
      `${weekStart.setLocale("fr").toFormat("dd LLL")} - ${weekStart
        .plus({ days: 6 })
        .setLocale("fr")
        .toFormat("dd LLL")}`,
    [weekStart]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChangeWeek(weekStart.minus({ weeks: 1 }))}
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          {"<"}
        </button>
        <div className="text-lg font-semibold flex-1 text-center">{weekLabel}</div>
        <button
          type="button"
          onClick={() => onChangeWeek(weekStart.plus({ weeks: 1 }))}
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          {">"}
        </button>
        <button
          type="button"
          onClick={() =>
            onChangeWeek(DateTime.now().setZone(MIAMI_TZ).startOf("week").plus({ days: 1 }))
          }
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          Aujourd&apos;hui
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day, idx) => {
          const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
          const slots = [...(daySlots.get(key) ?? [])].sort(
            (a, b) => a.start.getTime() - b.start.getTime()
          );
          const label = `${dayNames[idx]} ${day.setLocale("fr").toFormat("dd MMM")}`;
          return (
            <div key={key} className="space-y-2 rounded-xl border border-border bg-background-elevated p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-white">
                <span>{label}</span>
                <span className="text-[10px] uppercase tracking-widest text-white/40">
                  Brussels / Miami
                </span>
              </div>
              {slots.length === 0 ? (
                <div className="text-xs text-white/50">Aucun creneau</div>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => {
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const WeekCalendar = memo(WeekCalendarComponent);

