"use client";

import { memo } from "react";
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

function SlotButtonComponent({
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
  const isActionable = status === "available" && !quotaReached;

  const stateLabel = quotaReached && status === "available"
    ? "Quota atteint"
    : status === "booked"
    ? "Réservé"
    : status === "blocked"
    ? "Indisponible"
    : "Disponible";

  const badgeClass =
    status === "available" && isActionable
      ? "bg-primary/10 text-primary"
      : status === "booked"
      ? "bg-primary/10 text-primary"
      : "bg-gray-100 text-gray-500";

  const content = (
    <div>
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
    </div>
  )

  if (!isActionable) {
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-left text-gray-500 opacity-80">
        {content}
      </div>
    )
  }

  return (
    <form
      action={bookSlotAction}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Confirmer ce rendez vous ?\n${brussels} (Brussels)\n${miami} (Miami)`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="start" value={startIso} />
      <button
        type="submit"
        className={clsx(
          "w-full rounded-xl border px-4 py-4 text-left transition focus:outline-none focus:ring-2",
          "border-gray-200 bg-white text-gray-700 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-primary hover:bg-primary-50 focus:ring-primary/30"
        )}
      >
        {content}
      </button>
    </form>
  );
}

const SlotButton = memo(SlotButtonComponent);
export default SlotButton;

