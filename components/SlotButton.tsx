"use client";

import { memo, useState, useRef, useEffect } from "react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset loading state when slot status changes (after server revalidation)
  useEffect(() => {
    setIsSubmitting(false);
    setConfirming(false);
  }, [status]);

  const disabled = status !== "available" || quotaReached || isSubmitting;

  // Auto-cancel confirm state after 4 seconds
  useEffect(() => {
    if (confirming) {
      confirmTimer.current = setTimeout(() => setConfirming(false), 4000);
      return () => {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
      };
    }
  }, [confirming]);

  const stateLabel = isSubmitting
    ? "Réservation..."
    : confirming
    ? "Confirmer ?"
    : quotaReached && status === "available"
    ? "Quota atteint"
    : status === "booked"
    ? "Occupé"
    : status === "blocked"
    ? "Indisponible"
    : "Disponible";

  const badgeClass = isSubmitting
    ? "bg-[#C8A060]/60 text-black animate-pulse"
    : confirming
      ? "bg-green-500 text-white animate-pulse"
      : status === "available" && !disabled
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
        if (!confirming) {
          // First click: show confirm state, don't submit yet
          e.preventDefault();
          setConfirming(true);
          return;
        }
        // Second click: submit
        setIsSubmitting(true);
        setConfirming(false);
      }}
    >
      <input type="hidden" name="start" value={startIso} />
      <button
        type="submit"
        disabled={disabled}
        className={clsx(
          "w-full rounded-xl border px-4 py-4 text-left transition-all duration-200 focus:outline-none focus:ring-2",
          disabled
            ? "cursor-not-allowed border-gray-800 bg-[#0F0F0F] text-white/30 opacity-50"
            : confirming
            ? "border-green-500 bg-green-500/10 text-white ring-1 ring-green-500/30 scale-[1.02]"
            : "border-gray-800 bg-[#0F0F0F] text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#C8A060]/20 hover:border-[#C8A060] hover:bg-[#C8A060]/10 focus:ring-[#C8A060]/30"
        )}
      >
        {confirming && !isSubmitting ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-semibold">{brussels} - Brussels</span>
              <span className="block text-xs text-white/70">{miami} - Miami</span>
            </div>
            <span className={clsx("rounded-full px-3 py-1.5 text-xs font-bold", badgeClass)}>
              Confirmer ?
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin text-[#C8A060]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {brussels} - Brussels
                  </span>
                ) : (
                  `${brussels} - Brussels`
                )}
              </span>
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
          </>
        )}
      </button>
    </form>
  );
}

const SlotButton = memo(SlotButtonComponent);
export default SlotButton;
