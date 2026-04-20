"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { DateTime } from "luxon";
import Link from "next/link";
import type { SlotView } from "../../../lib/booking";
import { BRUSSELS_TZ, MIAMI_TZ } from "../../../lib/time";
import { CalendarViewToggle, type ViewMode } from "../../../components/CalendarViewToggle";
import { MonthCalendar } from "../../../components/MonthCalendar";
import { useLanguage } from "../../../components/LanguageProvider";
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

type NoAccountBlock = {
  id: number;
  startAt: Date | string;
  endAt: Date | string;
  reason: string;
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
  noAccountBlocks?: NoAccountBlock[];
};

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function normalizeSlots(slots: SlotView[]) {
  return slots.map((slot) => ({
    ...slot,
    start: new Date(slot.start),
    end: new Date(slot.end)
  }));
}

function groupSlotsByDay(slots: SlotView[], locale: string = "fr"): Map<string, DayGroup> {
  const map = new Map<string, DayGroup>();
  slots.forEach((slot) => {
    const day = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(MIAMI_TZ);
    const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: day.setLocale(locale).toFormat("EEEE dd MMMM"),
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


export default function AdminGeneralAvailability({ slots, bookings, rules, overrides, noAccountBlocks = [] }: Props) {
  const { t, translateSlotStatus, locale } = useLanguage();
  const normalized = useMemo(() => normalizeSlots(slots), [slots]);
  const dayMap = useMemo(() => groupSlotsByDay(normalized, locale), [normalized, locale]);
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
      label: inMiami.setLocale(locale).toFormat("EEEE dd MMMM"),
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

  // Blocks from Google with no matching client account
  const noAccountForDay = useMemo(() => {
    if (!selectedDay) return [];
    return noAccountBlocks
      .map((block) => ({
        ...block,
        startDate: new Date(block.startAt),
        endDate: new Date(block.endAt),
        clientName: (block.reason || "").replace("[NO_ACCOUNT] RDV — ", "").replace(" (non trouvé)", ""),
      }))
      .filter((block) => {
        const dayKey =
          DateTime.fromJSDate(block.startDate, { zone: "utc" }).setZone(MIAMI_TZ).toISODate() ??
          DateTime.fromJSDate(block.startDate, { zone: "utc" })
            .setZone(MIAMI_TZ)
            .toFormat("yyyy-LL-dd");
        return dayKey === selectedDay.key;
      });
  }, [noAccountBlocks, selectedDay]);

  // Mobile compact calendar (like MobileBookingView)
  const todayKey = useMemo(() => {
    const now = DateTime.now().setZone(MIAMI_TZ);
    return now.toISODate() ?? now.toFormat("yyyy-LL-dd");
  }, []);

  const [mobileSelectedKey, setMobileSelectedKey] = useState<string>(todayKey);
  const [mobileMonth, setMobileMonth] = useState<DateTime>(
    DateTime.now().setZone(MIAMI_TZ).startOf("month")
  );
  const mobileMonthLabel = mobileMonth.setLocale(locale).toFormat("LLLL yyyy");

  const mobileCalendarDays = useMemo(() => {
    const startOfMonth = mobileMonth.startOf("month");
    const daysFromMonday = (startOfMonth.weekday + 6) % 7;
    const gridStart = startOfMonth.minus({ days: daysFromMonday });
    const result: DateTime[] = [];
    for (let i = 0; i < 42; i++) {
      result.push(gridStart.plus({ days: i }));
    }
    return result;
  }, [mobileMonth]);

  const mobileSelectedData = useMemo(() => {
    const group = dayMap.get(mobileSelectedKey);
    if (group) return group;
    const day = DateTime.fromISO(mobileSelectedKey, { zone: MIAMI_TZ });
    return {
      key: mobileSelectedKey,
      label: day.isValid ? day.setLocale(locale).toFormat("EEEE dd MMMM") : "",
      slots: [] as SlotView[],
      date: day,
    };
  }, [mobileSelectedKey, dayMap]);

  const mobileDayNames = ["L", "M", "M", "J", "V", "S", "D"];

  const mobileBookingsForDay = useMemo(() => {
    if (!mobileSelectedKey) return [];
    return bookings
      .map((booking) => ({
        ...booking,
        startDate: new Date(booking.startAt),
        endDate: new Date(booking.endAt)
      }))
      .filter((booking) => {
        const dayKey =
          DateTime.fromJSDate(booking.startDate, { zone: "utc" }).setZone(MIAMI_TZ).toISODate() ??
          DateTime.fromJSDate(booking.startDate, { zone: "utc" }).setZone(MIAMI_TZ).toFormat("yyyy-LL-dd");
        return dayKey === mobileSelectedKey;
      });
  }, [bookings, mobileSelectedKey]);

  return (
    <>
    {/* ── MOBILE VIEW ── */}
    <div className="space-y-5 md:hidden">
      {/* Compact Month Calendar */}
      <div className="rounded-2xl border border-border bg-[#0F0F0F] p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileMonth((m) => m.minus({ months: 1 }))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 active:bg-white/20 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-wide">
            {mobileMonthLabel.charAt(0).toUpperCase() + mobileMonthLabel.slice(1)}
          </span>
          <button
            type="button"
            onClick={() => setMobileMonth((m) => m.plus({ months: 1 }))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 active:bg-white/20 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {mobileDayNames.map((name, i) => (
            <div key={`${name}-${i}`} className="text-center text-[11px] font-medium text-white/40 py-1">
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {mobileCalendarDays.map((day) => {
            const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
            const isCurrentMonth = day.month === mobileMonth.month;
            const isToday = key === todayKey;
            const isSelected = key === mobileSelectedKey;
            const group = dayMap.get(key);
            const availableCount = group ? group.slots.filter((s) => s.status === "available").length : 0;
            const bookedCount = group ? group.slots.filter((s) => s.status === "booked").length : 0;
            const hasSlots = (group?.slots.length ?? 0) > 0;
            const isPast = key < todayKey;
            const isBrusselsDay = group?.slots.some(
              (s) => (s as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM"
            );

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMobileSelectedKey(key);
                  openDay(day);
                }}
                className={`
                  relative flex flex-col items-center justify-center py-2 rounded-xl transition
                  ${!isCurrentMonth ? "opacity-20" : ""}
                  ${isPast && isCurrentMonth ? "opacity-40" : ""}
                  ${isSelected ? "bg-[#C8A060] text-black" : "text-white"}
                  ${!isSelected && isToday ? "ring-1 ring-white/50" : ""}
                  ${!isSelected && isCurrentMonth && !isPast ? "active:bg-white/10" : ""}
                `}
              >
                <span className={`text-sm font-medium ${isSelected ? "font-bold" : ""}`}>
                  {day.day}
                </span>
                <div className="mt-0.5 h-1.5 flex items-center gap-0.5">
                  {isBrusselsDay && !isSelected && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                  {availableCount > 0 && !isSelected && !isBrusselsDay && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-[#C8A060]" />
                  )}
                  {bookedCount > 0 && !isSelected && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-green-500" />
                  )}
                  {hasSlots && availableCount === 0 && bookedCount === 0 && !isSelected && !isBrusselsDay && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-white/25" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-[#C8A060]" />
            <span className="text-[10px] text-white/50">{t("legend.available")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[10px] text-white/50">{t("legend.booked")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-white/25" />
            <span className="text-[10px] text-white/50">{t("legend.blocked")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-white/50">Belgique</span>
          </div>
        </div>
      </div>

      {/* Selected day header */}
      <div className="space-y-1">
        <h3 className="font-[var(--font-playfair)] text-lg uppercase tracking-wider">
          {mobileSelectedData.label}
        </h3>
        <p className="text-xs text-white/50">
          {mobileSelectedData.slots.length === 0
            ? t("availability.noSlot")
            : `${mobileSelectedData.slots.filter((s) => s.status === "available").length} disponible${
                mobileSelectedData.slots.filter((s) => s.status === "available").length > 1 ? "s" : ""
              } · ${mobileSelectedData.slots.filter((s) => s.status === "booked").length} réservé${
                mobileSelectedData.slots.filter((s) => s.status === "booked").length > 1 ? "s" : ""
              }`}
        </p>
      </div>

      {/* Slots + Bookings for selected day */}
      {mobileSelectedData.slots.length > 0 ? (
        <div className="space-y-2">
          {mobileSelectedData.slots.map((slot) => {
            const slotActiveLocation = (slot as SlotView & { activeLocation?: string }).activeLocation;
            const isBrusselsSlot = slotActiveLocation === "BELGIUM";
            return (
              <div
                key={slot.start.toISOString()}
                className={`rounded-xl border px-4 py-3 ${
                  isBrusselsSlot ? "border-l-4 border-l-blue-500 " : ""
                }${
                  slot.status === "available"
                    ? isBrusselsSlot
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "border-[#C8A060]/30 bg-[#0F0F0F]"
                    : slot.status === "booked"
                    ? "border-green-800 bg-green-900/10"
                    : "border-gray-800 bg-[#0F0F0F] opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {isBrusselsSlot ? `${slot.brussels} Brussels` : `${slot.miami} Miami`}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    slot.status === "available"
                      ? "bg-[#C8A060] text-black"
                      : slot.status === "booked"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-white/10 text-white/60"
                  }`}>
                    {translateSlotStatus(slot.status)}
                  </span>
                </div>
                <div className="text-xs text-white/60">
                  {isBrusselsSlot ? `${slot.miami} Miami` : `${slot.brussels} Brussels`}
                </div>
                {isBrusselsSlot && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-[11px] font-medium text-blue-400">Belgique</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-[#0F0F0F] px-4 py-6 text-center text-sm text-white/40">
          {t("availability.noSlot")} pour cette date.
          <br />
          <span className="text-[11px]">Sélectionnez un jour avec un point.</span>
        </div>
      )}

      {/* Bookings for day */}
      {mobileBookingsForDay.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-[#C8A060]">{t("availability.reservations")}</h4>
          {mobileBookingsForDay.map((booking) => (
            <Link
              key={booking.id}
              href={`/admin/bookings/${booking.id}`}
              className="block rounded-xl border border-gray-800 bg-[#0F0F0F] px-4 py-3 transition hover:border-[#C8A060]/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{booking.client.name}</span>
                <span className="text-xs text-[#C8A060]">Voir →</span>
              </div>
              <div className="text-xs text-white/60">
                {DateTime.fromJSDate(booking.startDate, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("HH:mm")} -{" "}
                {DateTime.fromJSDate(booking.endDate, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("HH:mm")} Brussels
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>

    {/* ── DESKTOP VIEW ── */}
    <div className="hidden md:grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <div className="rounded-2xl border border-border bg-background-elevated p-6">
        <div className="flex items-center justify-between">
          <CalendarViewToggle value={view} onChange={setView} />
          <span className="text-xs uppercase tracking-widest text-white/50">
            Belgique / Miami
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
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setWeekStart(weekStart.minus({ weeks: 1 }))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-white/70 hover:bg-white/5 transition"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className="text-lg font-semibold flex-1 text-center">
                {weekStart.setLocale(locale).toFormat("dd LLL")} – {weekStart.plus({ days: 6 }).setLocale(locale).toFormat("dd LLL yyyy")}
              </div>
              <button
                type="button"
                onClick={() => setWeekStart(weekStart.plus({ weeks: 1 }))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-white/70 hover:bg-white/5 transition"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                type="button"
                onClick={() =>
                  setWeekStart(DateTime.now().setZone(MIAMI_TZ).startOf("week").plus({ days: 1 }))
                }
                className="rounded-full border border-border px-4 py-2 text-sm text-white/70 hover:bg-white/5 transition"
              >
                {t("availability.today")}
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-px min-w-[900px] rounded-xl border border-border overflow-hidden bg-border">
                {/* Day headers */}
                {Array.from({ length: 7 }, (_, i) => i).map((i) => {
                  const day = weekStart.plus({ days: i });
                  const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
                  const isToday = key === (DateTime.now().setZone(MIAMI_TZ).toISODate() ?? "");
                  const daySlots = dayMap.get(key)?.slots ?? [];
                  const availCount = daySlots.filter((s: SlotView) => s.status === "available").length;
                  const bookedCount = daySlots.filter((s: SlotView) => s.status === "booked").length;
                  const hasBrussels = daySlots.some((s: SlotView) => (s as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM");
                  return (
                    <button
                      key={`header-${key}`}
                      type="button"
                      onClick={() => openDay(day)}
                      className={`bg-[#0F0F0F] px-3 py-3 text-center transition hover:bg-white/5 ${isToday ? "bg-[#C8A060]/10" : ""}`}
                    >
                      <div className="text-[11px] uppercase tracking-widest text-white/40">{dayNames[i]}</div>
                      <div className={`text-lg font-semibold ${isToday ? "text-[#C8A060]" : "text-white"}`}>{day.day}</div>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        {availCount > 0 && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${hasBrussels ? "bg-blue-500/20 text-blue-400" : "bg-[#C8A060]/20 text-[#C8A060]"}`}>
                            {availCount}
                          </span>
                        )}
                        {bookedCount > 0 && (
                          <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">
                            {bookedCount}
                          </span>
                        )}
                        {availCount === 0 && bookedCount === 0 && (
                          <span className="text-[10px] text-white/20">—</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {/* Slot rows */}
                {Array.from({ length: 7 }, (_, i) => i).map((i) => {
                  const day = weekStart.plus({ days: i });
                  const key = day.toISODate() ?? day.toFormat("yyyy-LL-dd");
                  const slotsForDay = [...(dayMap.get(key)?.slots ?? [])].sort(
                    (a, b) => a.start.getTime() - b.start.getTime()
                  );
                  return (
                    <div key={`slots-${key}`} className="bg-[#0A0A0A] p-2 space-y-1 min-h-[200px]">
                      {slotsForDay.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-[11px] text-white/20">
                          {t("availability.noSlot")}
                        </div>
                      ) : (
                        slotsForDay.map((slot) => {
                          const isSlotBrussels = (slot as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM";
                          const isAvailable = slot.status === "available";
                          const isBooked = slot.status === "booked";
                          return (
                            <button
                              key={slot.start.toISOString()}
                              type="button"
                              onClick={() => openDay(day)}
                              className={`w-full rounded-lg px-2 py-1.5 text-left transition ${
                                isBooked
                                  ? "bg-green-500/10 border border-green-500/20 hover:bg-green-500/20"
                                  : isAvailable
                                  ? isSlotBrussels
                                    ? "bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
                                    : "bg-[#C8A060]/10 border border-[#C8A060]/20 hover:bg-[#C8A060]/20"
                                  : "bg-white/5 border border-white/5 opacity-40"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-white">
                                  {isSlotBrussels ? slot.brussels : slot.miami}
                                </span>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  isBooked ? "bg-green-400" : isAvailable ? isSlotBrussels ? "bg-blue-400" : "bg-[#C8A060]" : "bg-white/20"
                                }`} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
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
                    Belgique / Miami
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {group.slots.map((slot) => {
                    const isSlotBrussels = (slot as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM";
                    return (
                      <div
                        key={slot.start.toISOString()}
                        className={`rounded-xl border px-3 py-3 text-xs ${isSlotBrussels ? "border-l-2 border-l-blue-500 border-blue-500/30" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{isSlotBrussels ? `${slot.brussels} Brussels` : `${slot.miami} Miami`}</span>
                          <span className="text-[10px] uppercase tracking-widest text-white/40">
                            {translateSlotStatus(slot.status)}
                          </span>
                        </div>
                        <div className="text-white/60">{isSlotBrussels ? `${slot.miami} Miami` : `${slot.brussels} Brussels`}</div>
                      </div>
                    );
                  })}
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
                  <h3 className="text-lg font-semibold">{t("availability.summary")} {selectedDay.label}</h3>
                  <p className="text-sm text-white/60">
                    Belgique : {selectedDay.date.setZone(BRUSSELS_TZ).toFormat("dd LLL yyyy")}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-white/60 hover:text-white"
                  onClick={() => setSelectedDay(null)}
                >
                  {t("availability.close")}
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-primary">
                  {t("availability.availabilities")}
                </h4>
                {availabilitiesForDay.length > 0 ? (
                  <div className="space-y-2">
                    {availabilitiesForDay.map((slot) => {
                      const isSlotBrussels = (slot as SlotView & { activeLocation?: string }).activeLocation === "BELGIUM";
                      return (
                        <div
                          key={slot.start.toISOString()}
                          className={`rounded-lg border bg-[#0F0F0F] px-3 py-2 text-sm ${isSlotBrussels ? "border-l-2 border-l-blue-500 border-blue-500/30" : "border-gray-700"}`}
                        >
                          <p className="font-semibold text-white">
                            {isSlotBrussels ? `${slot.brussels} Brussels` : `${slot.miami} Miami`}
                          </p>
                          <p className="text-xs text-white/70">
                            {isSlotBrussels ? `${slot.miami} Miami` : `${slot.brussels} Brussels`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-white/50">{t("availability.noAvailability")}</p>
                )}
              </div>

              {/* Unified list: bookings + NO_ACCOUNT blocks, sorted by start time */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-primary">
                  {t("availability.reservations")}
                </h4>
                {(() => {
                  // Merge bookings and noAccount blocks into a single sorted list
                  const allItems: Array<{
                    type: 'booking' | 'no_account';
                    id: number;
                    name: string;
                    startDate: Date;
                    endDate: Date;
                    bookingId?: number;
                  }> = [
                    ...bookingsForDay.map((b) => ({
                      type: 'booking' as const,
                      id: b.id,
                      name: b.client.name,
                      startDate: b.startDate,
                      endDate: b.endDate,
                      bookingId: b.id,
                    })),
                    ...noAccountForDay.map((b) => ({
                      type: 'no_account' as const,
                      id: b.id + 100000,
                      name: b.clientName,
                      startDate: b.startDate,
                      endDate: b.endDate,
                    })),
                  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

                  if (allItems.length === 0) {
                    return <p className="text-sm text-white/50">{t("availability.noReservation")}</p>;
                  }

                  return (
                    <div className="space-y-2">
                      {allItems.map((item) => {
                        const brusselsStart = DateTime.fromJSDate(item.startDate, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("HH:mm");
                        const brusselsEnd = DateTime.fromJSDate(item.endDate, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("HH:mm");
                        const miamiStart = DateTime.fromJSDate(item.startDate, { zone: "utc" }).setZone(MIAMI_TZ).toFormat("HH:mm");
                        const miamiEnd = DateTime.fromJSDate(item.endDate, { zone: "utc" }).setZone(MIAMI_TZ).toFormat("HH:mm");

                        if (item.type === 'no_account') {
                          return (
                            <div
                              key={`na-${item.id}`}
                              className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm"
                            >
                              <p className="font-semibold text-red-300">{item.name}</p>
                              <p className="text-xs text-red-300/70">{brusselsStart} - {brusselsEnd} Brussels</p>
                              <p className="text-xs text-red-300/50">{miamiStart} - {miamiEnd} Miami</p>
                              <div className="mt-2 flex items-center gap-3">
                                <p className="text-xs text-red-400/80">
                                  {locale === "fr" ? "Pas de compte client." : "No client account."}
                                </p>
                                <Link
                                  href={`/admin/clients?name=${encodeURIComponent(item.name)}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <line x1="19" y1="8" x2="19" y2="14" />
                                    <line x1="22" y1="11" x2="16" y2="11" />
                                  </svg>
                                  {locale === "fr" ? "Créer le compte" : "Create account"}
                                </Link>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`bk-${item.id}`}
                            className="flex items-start justify-between gap-3 rounded-lg border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm"
                          >
                            <div className="flex-1">
                              <p className="font-semibold text-white">{item.name}</p>
                              <p className="text-xs text-white/70">{brusselsStart} - {brusselsEnd} Brussels</p>
                              <p className="text-xs text-white/60">{miamiStart} - {miamiEnd} Miami</p>
                            </div>
                            <Link
                              href={`/admin/bookings/${item.bookingId}`}
                              className="whitespace-nowrap text-sm font-medium text-primary transition-colors hover:text-primary-light"
                            >
                              Voir →
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[240px] items-center justify-center text-center text-white/50">
              {t("availability.clickDay")}
            </div>
          )}
        </div>

      </div>
    </div>
    </>
  );
}







