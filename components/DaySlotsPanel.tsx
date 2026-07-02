"use client";

import { memo, useEffect } from "react";
import { DateTime } from "luxon";
import SlotButton from "./SlotButton";
import type { SlotView } from "../lib/booking";
import { toMonthKey } from "../lib/time";
import { useLanguage } from "./LanguageProvider";

type Props = {
  open: boolean;
  dateLabel: string;
  slots: SlotView[];
  quotaReached: boolean;
  quotaByMonth?: Record<string, boolean>;
  onClose: () => void;
};

function DaySlotsPanelComponent({ open, dateLabel, slots, quotaReached, quotaByMonth, onClose }: Props) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 px-0 pb-0 sm:px-4 sm:py-6 md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:items-start md:justify-end md:bg-transparent md:p-6">
      <div className="w-full max-h-[90vh] max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-2xl md:h-[calc(100vh-3rem)] md:max-h-none md:rounded-2xl md:border md:border-[#D4DCE1] md:shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#D4DCE1] bg-white px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#7C8A93]">{t("legend.belgium")} / Miami</div>
            <div className="text-lg font-semibold leading-snug">{dateLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#5A6B76] hover:text-[#10222E]"
          >
            {t("availability.close")}
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-3 md:max-h-[calc(100%-72px)]">
          {slots.length === 0 ? (
            <div className="rounded-xl border border-[#D4DCE1] bg-[#F4F7F9] px-4 py-3 text-sm text-[#5A6B76]">
              {t("availability.noSlot")}
            </div>
          ) : (
            slots.map((slot) => (
              <SlotButton
                key={slot.start.toISOString()}
                startIso={slot.start.toISOString()}
                brussels={slot.brussels}
                miami={slot.miami}
                mode={slot.mode as any}
                location={slot.location as any}
                activeLocation={(slot as SlotView & { activeLocation?: "MIAMI" | "BELGIUM" }).activeLocation}
                presentielLocation={slot.presentielLocation}
                presentielNote={slot.presentielNote}
                status={slot.status}
                quotaReached={quotaByMonth ? (quotaByMonth[toMonthKey(slot.start)] ?? false) : quotaReached}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export const DaySlotsPanel = memo(DaySlotsPanelComponent);
