"use client";

import { useFormState } from "react-dom";
import { loginAction } from "./actions";
import type { LoginState } from "./types";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-6 card p-8">
      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-widest uppercase">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          className="w-full rounded-md border border-border bg-background-elevated px-3 py-3 text-sm focus:border-border focus:outline-none"
          placeholder="votre@email.com"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-widest uppercase">
          Mot de passe
        </label>
        <input
          type="password"
          name="password"
          required
          className="w-full rounded-md border border-border bg-background-elevated px-3 py-3 text-sm focus:border-border focus:outline-none"
          placeholder="Mot de passe"
        />
      </div>
      {state?.error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary w-full">
        SE CONNECTER
      </button>
      <p className="text-xs text-white/60">
        Accès réservé aux clients sous contrat. Besoin d&apos;aide ? Contactez
        Geoffrey directement.
      </p>
    </form>
  );
}

