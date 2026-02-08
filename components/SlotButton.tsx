"use client";

import { clsx } from "clsx";
import { bookSlotAction } from "../app/book/actions";

type SlotStatus = "available" | "booked" | "blocked";

type Props = {
  startIso: string;
  brussels: string;
  miami: string;
  mode?: "VISIO" | "PRESENTIEL";
  location?: "MIAMI" | "BELGIUM";
  presentielLocation?: string;
  presentielNote?: string | null;
  status: SlotStatus;
  quotaReached?: boolean;
};

export default function SlotButton({
  startIso,
  brussels,
  miami,
  mode = "VISIO",
  location = "MIAMI",
  presentielLocation,
  presentielNote,
  status,
  quotaReached = false
}: Props) {
  const disabled = status !== "available" || quotaReached;

  const stateLabel = quotaReached && status === "available"
    ? "Quota atteint"
    : status === "booked"
    ? "Occupe"
    : status === "blocked"
    ? "Indisponible"
    : "Disponible";

  const badgeClass =
    status === "available" && !disabled
      ? "bg-[#C8A060] text-black"
      : status === "booked"
      ? "bg-amber-100 text-amber-800"
      : "bg-white/10 text-white/60";

  return (
    <form
      action={bookSlotAction}
      onSubmit={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        const ok = window.confirm(
          `Confirmer ce rendez vous ?\n${brussels} (Brussels)\n${miami} (Miami)`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="start" value={startIso} />
      <button
        type="submit"
        disabled={disabled}
        className={clsx(
          "w-full rounded-xl border px-4 py-4 text-left transition focus:outline-none focus:ring-2",
          disabled
            ? "cursor-not-allowed border-gray-800 bg-[#0F0F0F] text-white/30 opacity-50 hover:translate-y-0 hover:shadow-none"
            : "border-gray-800 bg-[#0F0F0F] text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#C8A060]/20 hover:border-[#C8A060] hover:bg-[#C8A060]/10 focus:ring-[#C8A060]/30"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{brussels} - Brussels</span>
          <span className={clsx("rounded-full px-2 py-1 text-[11px] font-semibold", badgeClass)}>
            {stateLabel}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>{miami} - Miami</span>
          <span className="rounded-full bg-white/5 px-2 py-1 text-[11px]">
            {mode === "PRESENTIEL"
              ? `Présentiel${presentielLocation ? " - " + presentielLocation : ""}`
              : "Visio"}
          </span>
        </div>
        {mode === "PRESENTIEL" && presentielNote ? (
          <div className="mt-1 text-[11px] text-white/60">{presentielNote}</div>
        ) : null}
      </button>
    </form>
  );
}

