"use client";

import { useEffect } from "react";
import type { SlotView } from "../../../lib/booking";

type Props = {
  open: boolean;
  dateLabel: string;
  slots: SlotView[];
  onClose: () => void;
};

function statusLabel(status: SlotView["status"]) {
  if (status === "booked") return "Occupe";
  if (status === "blocked") return "Indisponible";
  return "Disponible";
}

function statusClass(status: SlotView["status"]) {
  if (status === "available") return "bg-[#C8A060] text-black";
  if (status === "booked") return "bg-amber-100 text-amber-800";
  return "bg-white/10 text-white/60";
}

export default function AdminDaySlotsPanel({ open, dateLabel, slots, onClose }: Props) {
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
      <div className="w-full max-h-[90vh] max-w-xl overflow-hidden rounded-t-3xl bg-background-elevated shadow-xl sm:rounded-2xl md:h-[calc(100vh-3rem)] md:max-h-none md:rounded-2xl md:border md:border-border md:shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background-elevated px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50">Brussels / Miami</div>
            <div className="text-lg font-semibold leading-snug">{dateLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/60 hover:text-white"
          >
            Fermer
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-3 md:max-h-[calc(100%-72px)]">
          {slots.length === 0 ? (
            <div className="rounded-xl border border-border bg-background-elevated/5 px-4 py-3 text-sm text-white/70">
              Aucun creneau pour cette date.
            </div>
          ) : (
            slots.map((slot) => (
              <div
                key={slot.start.toISOString()}
                className="w-full rounded-xl border border-gray-800 bg-[#0F0F0F] px-4 py-4 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{slot.brussels} - Brussels</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(slot.status)}`}
                  >
                    {statusLabel(slot.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>{slot.miami} - Miami</span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[11px]">
                    {slot.mode === "PRESENTIEL"
                      ? `Presentiel${slot.presentielLocation ? " - " + slot.presentielLocation : ""}`
                      : "Visio"}
                  </span>
                </div>
                {slot.mode === "PRESENTIEL" && slot.presentielNote ? (
                  <div className="mt-1 text-[11px] text-white/60">{slot.presentielNote}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
