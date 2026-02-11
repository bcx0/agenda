"use client";

import { useFormStatus } from "react-dom";

type Action = (formData: FormData) => void | Promise<void>;

type SlotOption = { value: string; label: string };

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

export function ManageForms({
  token,
  availableSlots,
  cancelAppointmentAction,
  rescheduleAppointmentAction
}: {
  token: string;
  availableSlots: SlotOption[];
  cancelAppointmentAction: Action;
  rescheduleAppointmentAction: Action;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={cancelAppointmentAction} className="card space-y-4 p-6">
        <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
          Annuler
        </h2>
        <p className="text-sm text-white/70">
          Merci d'indiquer le motif de l'annulation.
        </p>
        <input type="hidden" name="token" value={token} />
        <textarea
          name="reason"
          required
          rows={4}
          placeholder="Motif d'annulation"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <SubmitButton
          label="Confirmer l'annulation"
          loadingLabel="Annulation..."
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100"
        />
      </form>

      <form action={rescheduleAppointmentAction} className="card space-y-4 p-6">
        <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
          Modifier
        </h2>
        <p className="text-sm text-white/70">
          Choisissez un nouveau créneau disponible.
        </p>
        <input type="hidden" name="token" value={token} />
        <label className="space-y-2 text-sm">
          <span className="block text-white/60">Nouveau créneau</span>
          <select
            name="start"
            required
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un créneau</option>
            {availableSlots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
        {availableSlots.length === 0 ? (
          <p className="text-sm text-white/60">Aucun créneau disponible pour le moment.</p>
        ) : null}
        <textarea
          name="reason"
          required
          rows={4}
          placeholder="Motif de la modification"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <SubmitButton
          label="Confirmer la modification"
          loadingLabel="Modification..."
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-black hover:text-white"
        />
      </form>
    </div>
  );
}
