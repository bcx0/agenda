"use client";

import { memo, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { bookSlotAction } from "../app/book/actions";
import { useLanguage } from "./LanguageProvider";

type SlotStatus = "available" | "booked" | "blocked";

type Props = {
  startIso: string;
  brussels: string;
  miami: string;
  mode?: "VISIO" | "PRESENTIEL";
  location?: "MIAMI" | "BELGIUM";
  activeLocation?: "MIAMI" | "BELGIUM";
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
  activeLocation = "MIAMI",
  presentielLocation,
  presentielNote,
  status,
  quotaReached = false
}: Props) {
  const { t } = useLanguage();
  const isBrussels = activeLocation === "BELGIUM";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset loading state after server response. On success the slot status
  // changes; on error (quota, slot taken…) the status stays "available", so we
  // also reset when the URL search params change (?error= / ?success=).
  const searchParams = useSearchParams();
  useEffect(() => {
    setIsSubmitting(false);
    setConfirming(false);
  }, [status, searchParams]);

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
    ? t("slotButton.reserving")
    : confirming
    ? t("slotButton.confirmQ")
    : quotaReached && status === "available"
    ? t("slotButton.quotaReached")
    : status === "booked"
    ? t("slotButton.occupied")
    : status === "blocked"
    ? t("slotButton.unavailable")
    : t("slotButton.available");

  const badgeClass = isSubmitting
    ? "bg-[#1C4A63]/60 text-white animate-pulse"
    : confirming
      ? "bg-green-500 text-white animate-pulse"
      : status === "available" && !disabled
        ? "bg-[#1C4A63] text-white"
        : status === "booked"
        ? "bg-[#E1E7EA] text-[#5A6B76]"
        : "bg-[#EFF2F4] text-[#8A98A1]";

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
          isBrussels && "border-l-4 border-l-[#E8452A]",
          disabled
            ? "cursor-not-allowed border-[#E4E9EC] bg-[#F0F3F5] text-[#8A98A1] opacity-70"
            : confirming
            ? "border-green-500 bg-green-50 text-[#10222E] ring-1 ring-green-500/30 scale-[1.02]"
            : isBrussels
            ? "border-[#E8452A]/40 bg-[#E8452A]/5 text-[#10222E] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#E8452A]/20 hover:border-[#E8452A] hover:bg-[#E8452A]/10 focus:ring-[#E8452A]/30"
            : "border-[#D4DCE1] bg-white text-[#10222E] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1C4A63]/20 hover:border-[#1C4A63] hover:bg-[#1C4A63]/5 focus:ring-[#1C4A63]/30"
        )}
      >
        {confirming && !isSubmitting ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-semibold">
                {isBrussels ? `${brussels} Brussels` : `${miami} Miami`}
              </span>
              <span className="block text-xs text-[#5A6B76]">
                {isBrussels ? `${miami} Miami` : `${brussels} Brussels`}
              </span>
            </div>
            <span className={clsx("rounded-full px-3 py-1.5 text-xs font-bold", badgeClass)}>
              {t("slotButton.confirmQ")}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin text-[#1C4A63]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {isBrussels ? `${brussels} Brussels` : `${miami} Miami`}
                  </span>
                ) : isBrussels ? (
                  `${brussels} Brussels`
                ) : (
                  `${miami} Miami`
                )}
              </span>
              <span className={clsx("rounded-full px-2 py-1 text-[11px] font-semibold", badgeClass)}>
                {stateLabel}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#5A6B76]">
              <span>{isBrussels ? `${miami} Miami` : `${brussels} Brussels`}</span>
              <span className="rounded-full bg-[#10222E]/5 px-2 py-1 text-[11px]">
                {mode === "PRESENTIEL"
                  ? `${t("slotButton.presentiel")}${presentielLocation ? " - " + presentielLocation : ""}`
                  : t("slotButton.visio")}
              </span>
            </div>
            {isBrussels && (
              <div className="mt-1 flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[#E8452A]" />
                <span className="text-[11px] font-medium text-[#C93A22]">{t("slotButton.belgium")}</span>
              </div>
            )}
            {mode === "PRESENTIEL" && presentielNote ? (
              <div className="mt-1 text-[11px] text-[#5A6B76]">{presentielNote}</div>
            ) : null}
          </>
        )}
      </button>
    </form>
  );
}

const SlotButton = memo(SlotButtonComponent);
export default SlotButton;
