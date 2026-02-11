"use client";

import { useFormStatus } from "react-dom";

type Action = (formData: FormData) => void | Promise<void>;

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

function SubmitButton({
  label,
  loadingLabel,
  className
}: {
  label: string;
  loadingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function BookingActions({
  bookingId,
  adminRescheduleBookingAction,
  cancelBookingAction
}: {
  bookingId: number;
  adminRescheduleBookingAction: Action;
  cancelBookingAction: Action;
}) {
  return (
    <div className="grid gap-2 pt-2 md:grid-cols-[1fr_auto] md:items-end">
      <form action={adminRescheduleBookingAction} className="grid gap-2 md:grid-cols-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="datetime-local" name="start" className="input" required />
        <input
          type="text"
          name="reason"
          placeholder="Motif (optionnel)"
          className="input md:col-span-2"
        />
        <SubmitButton
          label="Modifier"
          loadingLabel="Modification..."
          className="btn-secondary text-sm md:col-span-3"
        />
      </form>
      <form action={cancelBookingAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <SubmitButton
          label="Annuler"
          loadingLabel="Annulation..."
          className="btn-danger text-sm w-full"
        />
      </form>
    </div>
  );
}
