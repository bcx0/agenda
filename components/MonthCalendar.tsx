"use client";

import { memo, useMemo } from "react";
import { DateTime } from "luxon";
import type { SlotView } from "../lib/booking";
import { CALENDAR_TZ } from "../lib/time";
import { useLanguage } from "./LanguageProvider";

type SlotWithLocation = SlotView & { activeLocation?: "MIAMI" | "BELGIUM" };

type Props = {
  month: DateTime;
  daySlots: Map<string, SlotView[]>;
  onChangeMonth: (next: DateTime) => void;
  onSelectDay: (day: DateTime) => void;
  allowEmptySelection?: boolean;
  selectedDayKey?: string | null;
};

function MonthCalendarComponent({
  month,
  daySlots,
  onChangeMonth,
  onSelectDay,
  allowEmptySelection = false,
  selectedDayKey = null
}: Props) {
  const { t, locale } = useLanguage();
  const dayNames = [t("day.mon"), t("day.tue"), t("day.wed"), t("day.thu"), t("day.fri"), t("day.sat"), t("day.sun")];
  const days = useMemo(() => {
    const startOfMonth = month.startOf("month");
    const daysFromMonday = (startOfMonth.weekday + 6) % 7;
    const gridStart = startOfMonth.minus({ days: daysFromMonday });
    const nextDays: DateTime[] = [];
    for (let i = 0; i < 42; i++) {
      nextDays.push(gridStart.plus({ days: i }));
    }
    return nextDays;
  }, [month]);

  const todayKey = useMemo(() => {
    const nowMiami = DateTime.now().setZone(CALENDAR_TZ);
    return nowMiami.toISODate() ?? nowMiami.toFormat("yyyy-LL-dd");
  }, []);
  const monthLabel = month.setLocale(locale === "en" ? "en" : "fr").toFormat("LLLL yyyy");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onChangeMonth(month.minus({ months: 1 }))}
          className="cal-nav-btn"
        >
          {"<"}
        </button>
        <div className="text-lg font-semibold text-center whitespace-nowrap">
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </div>
        <button
          type="button"
          onClick={() => onChangeMonth(month.plus({ months: 1 }))}
          className="cal-nav-btn"
        >
          {">"}
        </button>
        <button
          type="button"
          onClick={() => onChangeMonth(DateTime.now().setZone(CALENDAR_TZ).startOf("month"))}
          className="cal-nav-btn whitespace-nowrap"
        >
          {t("calendar.today")}
        </button>
      </div>

      <div className="cal-head grid grid-cols-7 text-xs uppercase tracking-widest">
        {dayNames.map((name) => (
          <div key={name} className="px-2 py-1 text-center">
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
          const slots = daySlots.get(key) ?? [];
          const totalSlots = slots.length;
          let bookedCount = 0;
          let availableCount = 0;
          for (const slot of slots) {
            if (slot.status === "booked") bookedCount++;
            if (slot.status === "available") availableCount++;
          }
          const hasSlots = totalSlots > 0;
          const isCurrentMonth = day.month === month.month;
          const isToday = key === todayKey;
          const isSelected = selectedDayKey === key;
          const isBrusselsDay = slots.some(
            (s) => (s as SlotWithLocation).activeLocation === "BELGIUM"
          );
          const statusLabel =
            availableCount > 0
              ? availableCount === 1
              ? t("calendar.available1")
              : `${availableCount} ${t("calendar.availableN")}`
              : hasSlots && bookedCount === totalSlots
              ? t("calendar.full")
              : hasSlots
              ? t("calendar.busy")
              : t("calendar.noSlot");

          const isSelectable = hasSlots || allowEmptySelection;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`min-h-[100px] rounded-xl px-3 py-3 text-left transition ${
                isSelectable
                  ? isBrusselsDay
                    ? "cal-cell-brussels"
                    : "cal-cell-open"
                  : "cal-cell-off"
              } ${isToday || isSelected ? "cal-cell-focus" : ""}`}
              aria-label={`Selectionner le ${day.setLocale(locale === "en" ? "en" : "fr").toFormat("dd LLLL")}`}
              disabled={!isSelectable}
            >
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{day.day}</span>
                {isToday && (
                  <span className="cal-today-badge">
                    {t("calendar.today")}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] ${
                    availableCount > 0
                      ? isBrusselsDay
                        ? "cal-badge-brussels"
                        : "cal-badge-avail"
                      : "cal-badge-none"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="cal-legend flex flex-wrap items-center justify-center gap-4 rounded-lg border px-4 py-2">
        <span className="cal-legend-item flex items-center gap-2 text-xs">
          <span className="cal-legend-miami inline-block h-3 w-6 rounded border-2" />
          {t("legend.miami")}
        </span>
        <span className="cal-legend-item flex items-center gap-2 text-xs">
          <span className="cal-legend-brussels inline-block h-3 w-6 rounded border-2" />
          {t("legend.belgium")}
        </span>
        <span className="cal-legend-item flex items-center gap-2 text-xs">
          <span className="cal-legend-off inline-block h-3 w-6 rounded border-2" />
          {t("legend.unavailable")}
        </span>
      </div>
    </div>
  );
}

export const MonthCalendar = memo(MonthCalendarComponent);
