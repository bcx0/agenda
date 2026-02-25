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

export function AddClientForm({ action }: { action: Action }) {
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <input type="text" name="name" placeholder="Nom" required className="input" />
        <input type="email" name="email" placeholder="Email" required className="input" />
        <input
          type="number"
          min={1}
          name="creditsPerMonth"
          placeholder="Crédits/mois"
          required
          className="input"
        />
        <input
          type="text"
          name="password"
          placeholder="Mot de passe"
          required
          className="input"
        />
      </div>
      <SubmitButton
        label="Ajouter"
        loadingLabel="Ajout..."
        className="btn btn-primary w-full"
      />
    </form>
  );
}

export function ClientActions({
  clientId,
  creditsPerMonth,
  isActive,
  updateCreditsAction,
  toggleClientAction
}: {
  clientId: number;
  creditsPerMonth: number;
  isActive: boolean;
  updateCreditsAction: Action;
  toggleClientAction: Action;
}) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <form action={updateCreditsAction} className="flex items-center gap-2 text-xs">
        <input type="hidden" name="clientId" value={clientId} />
        <input
          type="number"
          name="creditsPerMonth"
          min={1}
          defaultValue={creditsPerMonth}
          className="w-full rounded-md border border-border px-2 py-2"
        />
        <SubmitButton
          label="Mettre à jour"
          loadingLabel="Mise à jour..."
          className="rounded-md border border-border px-3 py-2 hover:bg-black hover:text-white"
        />
      </form>
      <form action={toggleClientAction} className="flex items-center justify-end">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="active" value={(!isActive).toString()} />
        <SubmitButton
          label={isActive ? "Désactiver" : "Activer"}
          loadingLabel="Chargement..."
          className="rounded-md border border-border px-3 py-2 text-xs hover:bg-black hover:text-white"
        />
      </form>
    </div>
  );
}
