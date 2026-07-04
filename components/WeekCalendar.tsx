"use client";

import { memo, useMemo } from "react";
import { DateTime } from "luxon";
import SlotButton from "./SlotButton";
import type { SlotView } from "../lib/booking";
import { CALENDAR_TZ, toMonthKey } from "../lib/time";
import { useLanguage } from "./LanguageProvider";

type Props = {
  weekStart: DateTime;
  daySlots: Map<string, SlotView[]>;
  quotaReached: boolean;
  quotaByMonth?: Record<string, boolean>;
  onChangeWeek: (next: DateTime) => void;
};

function WeekCalendarComponent({ weekStart, daySlots, quotaReached, quotaByMonth, onChangeWeek }: Props) {
  const { t, locale } = useLanguage();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart]
  );
  const weekLabel = useMemo(
    () =>
      `${weekStart.setLocale(locale).toFormat("dd LLL")} - ${weekStart
        .plus({ days: 6 })
        .setLocale(locale)
        .toFormat("dd LLL")}`,
    [weekStart, locale]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChangeWeek(weekStart.minus({ weeks: 1 }))}
          className="rounded-full border border-[#D4DCE1] px-3 py-2 text-sm hover:bg-[#10222E]/5"
        >
          {"<"}
        </button>
        <div className="text-lg font-semibold flex-1 text-center">{weekLabel}</div>
        <button
          type="button"
          onClick={() => onChangeWeek(weekStart.plus({ weeks: 1 }))}
          className="rounded-full border border-[#D4DCE1] px-3 py-2 text-sm hover:bg-[#10222E]/5"
        >
          {">"}
        </button>
        <button
          type="button"
          onClick={() =>
            // Luxon startOf("week") is Monday (ISO) — no "+1 day" needed
            onChangeWeek(DateTime.now().setZone(CALENDAR_TZ).startOf("week"))
          }
          className="rounded-full border border-[#D4DCE1] px-3 py-2 text-sm hover:bg-[#10222E]/5"
        >
          {t("calendar.today")}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day, idx) => {
          const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
          const slots = [...(daySlots.get(key) ?? [])].sort(
            (a, b) => a.start.getTime() - b.start.getTime()
          );
          // Derive the weekday name from the actual date (the old hardcoded
          // dayNames[idx] could label a Tuesday column "Lundi")
          const weekdayName = day.setLocale(locale).toFormat("EEEE");
          const label = `${weekdayName.charAt(0).toUpperCase()}${weekdayName.slice(1)} ${day
            .setLocale(locale)
            .toFormat("dd MMM")}`;
          return (
            <div key={key} className="space-y-2 rounded-xl border border-[#D4DCE1] bg-white p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-[#10222E]">
                <span>{label}</span>
                <span className="text-[10px] uppercase tracking-widest text-[#8A98A1]">
                  Brussels / Miami
                </span>
              </div>
              {slots.length === 0 ? (
                <div className="text-xs text-[#7C8A93]">{t("mobileCal.noSlotForDate")}</div>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => {
                    return (
                      <SlotButton
                        key={slot.start.toISOString()}
                        startIso={slot.start.toISOString()}
                        brussels={slot.brussels}
                        miami={slot.miami}
                        mode={slot.mode}
                        location={slot.location}
                        activeLocation={slot.activeLocation}
                        presentielLocation={slot.presentielLocation}
                        presentielNote={slot.presentielNote}
                        status={slot.status}
                        quotaReached={quotaByMonth ? (quotaByMonth[toMonthKey(slot.start)] ?? false) : quotaReached}
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
