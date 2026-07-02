"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { SlotView } from "../lib/booking";
import { CALENDAR_TZ, toMonthKey } from "../lib/time";
import SlotButton from "./SlotButton";
import { useLanguage } from "./LanguageProvider";

type Props = {
  slots: SlotView[];
  quotaReached: boolean;
  quotaByMonth?: Record<string, boolean>;
};

/** Compact mobile calendar + inline day slots — inspired by Doctolib/Calendly */
function MobileBookingViewComponent({ slots, quotaReached, quotaByMonth }: Props) {
  const { t, locale } = useLanguage();
  const normalizedSlots = useMemo(
    () =>
      slots.map((slot) => ({
        ...slot,
        start: new Date(slot.start),
        end: new Date(slot.end),
      })),
    [slots]
  );

  // Group slots by day (Miami timezone)
  const dayMap = useMemo(() => {
    const map = new Map<string, { key: string; label: string; slots: SlotView[]; date: DateTime }>();
    normalizedSlots.forEach((slot) => {
      const day = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(CALENDAR_TZ);
      const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: day.setLocale(locale).toFormat("EEEE dd MMMM"),
          slots: [],
          date: day,
        });
      }
      map.get(key)?.slots.push(slot);
    });
    return map;
  }, [normalizedSlots]);

  // Calendar state
  const [month, setMonth] = useState<DateTime>(
    DateTime.now().setZone(CALENDAR_TZ).startOf("month")
  );
  const todayKey = useMemo(() => {
    const now = DateTime.now().setZone(CALENDAR_TZ);
    return now.toISODate() ?? now.toFormat("yyyy-LL-dd");
  }, []);

  // Auto-select today or first available day
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (dayMap.has(todayKey)) return todayKey;
    const sorted = Array.from(dayMap.keys()).sort();
    const future = sorted.find((k) => k >= todayKey);
    return future ?? todayKey;
  });

  const monthLabel = month.setLocale(locale).toFormat("LLLL yyyy");

  // Build 42-day grid for calendar
  const calendarDays = useMemo(() => {
    const startOfMonth = month.startOf("month");
    const daysFromMonday = (startOfMonth.weekday + 6) % 7;
    const gridStart = startOfMonth.minus({ days: daysFromMonday });
    const result: DateTime[] = [];
    for (let i = 0; i < 42; i++) {
      result.push(gridStart.plus({ days: i }));
    }
    return result;
  }, [month]);

  // Selected day data
  const selectedData = useMemo(() => {
    const group = dayMap.get(selectedKey);
    if (group) return group;
    const day = DateTime.fromISO(selectedKey, { zone: CALENDAR_TZ });
    return {
      key: selectedKey,
      label: day.isValid
        ? day.setLocale(locale).toFormat("EEEE dd MMMM")
        : "",
      slots: [] as SlotView[],
      date: day,
    };
  }, [selectedKey, dayMap]);

  const handleSelectDay = useCallback(
    (day: DateTime) => {
      const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
      setSelectedKey(key);
    },
    []
  );

  const handlePrevMonth = useCallback(() => {
    setMonth((m) => m.minus({ months: 1 }));
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth((m) => m.plus({ months: 1 }));
  }, []);

  const dayNames = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div className="space-y-5">
      {/* ── Compact Month Calendar ── */}
      <div className="rounded-2xl border border-[#D4DCE1] bg-white p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#5A6B76] hover:bg-[#10222E]/5 active:bg-[#10222E]/10 transition"
            aria-label="Mois précédent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-wide">
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#5A6B76] hover:bg-[#10222E]/5 active:bg-[#10222E]/10 transition"
            aria-label="Mois suivant"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="text-center text-[11px] font-medium text-[#8A98A1] py-1"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {calendarDays.map((day) => {
            const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
            const isCurrentMonth = day.month === month.month;
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const group = dayMap.get(key);
            const availableCount = group
              ? group.slots.filter((s) => s.status === "available").length
              : 0;
            const hasSlots = (group?.slots.length ?? 0) > 0;
            const isPast = key < todayKey;
            const isBrusselsDay = group
              ? group.slots.some(
                  (s) => (s as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM"
                )
              : false;

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectDay(day)}
                className={`
                  relative flex flex-col items-center justify-center py-2 rounded-xl transition
                  ${!isCurrentMonth ? "opacity-20" : ""}
                  ${isPast && isCurrentMonth ? "opacity-40" : ""}
                  ${isSelected ? "bg-[#1C4A63] text-white" : "text-[#10222E]"}
                  ${!isSelected && isToday ? "ring-1 ring-[#1C4A63]/50" : ""}
                  ${!isSelected && isCurrentMonth && !isPast ? "active:bg-[#10222E]/5" : ""}
                `}
                aria-label={day.setLocale(locale).toFormat("dd MMMM")}
              >
                <span className={`text-sm font-medium ${isSelected ? "font-bold" : ""}`}>
                  {day.day}
                </span>
                {/* Availability dot */}
                <div className="mt-0.5 h-1.5 flex items-center gap-0.5">
                  {availableCount > 0 && !isSelected && (
                    <span
                      className={`block h-1.5 w-1.5 rounded-full ${
                        isBrusselsDay ? "bg-[#E8452A]" : "bg-[#1C4A63]"
                      }`}
                    />
                  )}
                  {hasSlots && availableCount === 0 && !isSelected && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-[#C3CDD3]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-[#E4E9EC]">
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-[#1C4A63]" />
            <span className="text-[10px] text-[#7C8A93]">{t("legend.available")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-[#E8452A]" />
            <span className="text-[10px] text-[#7C8A93]">{t("slotButton.belgium")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-[#C3CDD3]" />
            <span className="text-[10px] text-[#7C8A93]">{t("calendar.full")}</span>
          </div>
        </div>
      </div>

      {/* ── Selected day header ── */}
      <div className="space-y-1">
        <h3 className="font-[var(--font-playfair)] text-lg uppercase tracking-wider">
          {selectedData.label}
        </h3>
        <p className="text-xs text-[#7C8A93]">
          {(() => {
            const availableCount = selectedData.slots.filter((s) => s.status === "available").length;
            if (selectedData.slots.length === 0) return t("mobileCal.noSlotAvailable");
            if (availableCount === 0) return t("calendar.full");
            if (availableCount === 1) return t("mobileCal.available1");
            return `${availableCount} ${t("mobileCal.availableN")}`;
          })()}
        </p>
      </div>

      {/* ── Slot list for selected day ── */}
      {selectedData.slots.length > 0 ? (
        <div className="space-y-3">
          {selectedData.slots.map((slot) => (
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
              quotaReached={quotaByMonth ? (quotaByMonth[toMonthKey(slot.start)] ?? false) : quotaReached}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#D4DCE1] bg-white px-4 py-6 text-center text-sm text-[#8A98A1]">
          {t("mobileCal.noSlotForDate")}
          <br />
          <span className="text-[11px]">{t("mobileCal.selectGoldDay")}</span>
        </div>
      )}
    </div>
  );
}

export const MobileBookingView = memo(MobileBookingViewComponent);
