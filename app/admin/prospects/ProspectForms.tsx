"use client";

import { useFormStatus } from "react-dom";
import { PROSPECT_STATUSES, type ProspectStatus } from "../../../lib/prospects";

type Action = (formData: FormData) => void | Promise<void>;

const STATUS_LABELS: Record<ProspectStatus, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  CONVERTED: "Converti",
  ARCHIVED: "Archivé",
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SubmitButton({
  label,
  loadingLabel,
  className,
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
        <span className="flex items-center justify-center gap-2">
          <Spinner />
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function AddProspectForm({
  action,
  defaults,
}: {
  action: Action;
  defaults?: { name?: string; email?: string; phone?: string };
}) {
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="text"
          name="name"
          placeholder="Nom du prospect *"
          required
          defaultValue={defaults?.name ?? ""}
          className="input"
        />
        <input
          type="email"
          name="email"
          placeholder="Email (optionnel)"
          defaultValue={defaults?.email ?? ""}
          className="input"
        />
        <input
          type="text"
          name="phone"
          placeholder="Téléphone (optionnel)"
          defaultValue={defaults?.phone ?? ""}
          className="input"
        />
        <input
          type="datetime-local"
          name="desiredAt"
          className="input"
          aria-label="Créneau souhaité (optionnel)"
        />
      </div>
      <textarea
        name="note"
        rows={2}
        placeholder="Note (optionnel)"
        className="input w-full"
      />
      <SubmitButton
        label="Ajouter le prospect"
        loadingLabel="Ajout..."
        className="btn btn-primary w-full"
      />
    </form>
  );
}

export function ProspectActions({
  id,
  status,
  updateStatusAction,
  deleteAction,
}: {
  id: number;
  status: ProspectStatus;
  updateStatusAction: Action;
  deleteAction: Action;
}) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <form action={updateStatusAction} className="flex items-center gap-2 text-xs">
        <input type="hidden" name="id" value={id} />
        <select name="status" defaultValue={status} className="input flex-1 text-xs">
          {PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <SubmitButton
          label="OK"
          loadingLabel="..."
          className="rounded-md border border-border px-3 py-2 hover:bg-black hover:text-white"
        />
      </form>
      <form action={deleteAction} className="flex items-center justify-end">
        <input type="hidden" name="id" value={id} />
        <SubmitButton
          label="Supprimer"
          loadingLabel="Suppression..."
          className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-300 hover:bg-red-500 hover:text-white"
        />
      </form>
    </div>
  );
}

export { STATUS_LABELS };
