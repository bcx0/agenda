"use client";

import { useFormState } from "react-dom";
import { loginAction } from "./actions";
import type { LoginState } from "./types";
import PasswordInput from "../../components/PasswordInput";

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
          className="w-full rounded-md border border-[#D4DCE1] bg-white px-3 py-3 text-sm focus:border-[#1C4A63] focus:outline-none"
          placeholder="votre@email.com"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-widest uppercase">
          Mot de passe
        </label>
        <PasswordInput
          name="password"
          required
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
      <p className="text-xs text-[#5A6B76]">
        Accès réservé aux clients sous contrat. Besoin d&apos;aide ? Contactez
        Geoffrey directement.
      </p>
    </form>
  );
}
