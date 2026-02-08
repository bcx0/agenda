"use client";

import { DateTime } from "luxon";
import type { SlotView } from "../lib/booking";
import { MIAMI_TZ } from "../lib/time";

type Props = {
  month: DateTime;
  daySlots: Map<string, SlotView[]>;
  onChangeMonth: (next: DateTime) => void;
  onSelectDay: (day: DateTime) => void;
};

const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function MonthCalendar({ month, daySlots, onChangeMonth, onSelectDay }: Props) {
  const startOfMonth = month.startOf("month");
  const daysFromMonday = (startOfMonth.weekday + 6) % 7;
  const gridStart = startOfMonth.minus({ days: daysFromMonday });
  const days: DateTime[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(gridStart.plus({ days: i }));
  }

  const todayKey =
    DateTime.now().setZone(MIAMI_TZ).toISODate() ??
    DateTime.now().setZone(MIAMI_TZ).toFormat("yyyy-LL-dd");
  const monthLabel = month.setLocale("fr").toFormat("LLLL yyyy");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChangeMonth(month.minus({ months: 1 }))}
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          {"<"}
        </button>
        <div className="text-lg font-semibold flex-1 text-center">
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </div>
        <button
          type="button"
          onClick={() => onChangeMonth(month.plus({ months: 1 }))}
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          {">"}
        </button>
        <button
          type="button"
          onClick={() => onChangeMonth(DateTime.now().setZone(MIAMI_TZ).startOf("month"))}
          className="rounded-full border border-border px-3 py-2 text-sm hover:bg-background-elevated/5"
        >
          Aujourd&apos;hui
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs uppercase tracking-widest text-white/50">
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
          const bookedCount = slots.filter((s) => s.status === "booked").length;
          const availableCount = slots.filter((s) => s.status === "available").length;
          const hasSlots = totalSlots > 0;
          const isCurrentMonth = day.month === month.month;
          const isToday = key === todayKey;
          const statusLabel =
            availableCount > 0
              ? availableCount === 1
              ? "1 disponibilité"
              : `${availableCount} disponibilités`
              : hasSlots && bookedCount === totalSlots
              ? "Complet"
              : hasSlots
              ? "Occupé"
              : "Aucun creneau";

          console.log(
            "Jour:",
            key,
            "Slots totaux:",
            totalSlots,
            "Reservations:",
            bookedCount,
            "Disponibles:",
            availableCount
          );

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`min-h-[100px] rounded-xl px-3 py-3 text-left transition ${
                hasSlots
                  ? "bg-[#0F0F0F] border-4 border-[#C8A060] text-white font-semibold hover:border-[#E8D7BE] hover:bg-[#1A1A1A]"
                  : "bg-[#0F0F0F] border-4 border-gray-700 text-white/30 opacity-40 cursor-not-allowed"
              } ${isToday ? "ring-2 ring-white" : ""}`}
              aria-label={`Selectionner le ${day.toFormat("dd LLLL")}`}
              disabled={!hasSlots}
            >
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{day.day}</span>
                {isToday && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white/70">
                    Aujourd&apos;hui
                  </span>
                )}
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] ${
                    availableCount > 0
                      ? "bg-[#C8A060] text-black"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

