export const runtime = "nodejs";

import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:py-24">
      <div className="flex flex-col gap-10 md:grid md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-6">
          <p className="pill">Connexion sécurisée</p>
          <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider text-white md:text-4xl">
            Espace client
          </h1>
          <p className="hidden italic text-lg text-white/70 md:block">
            « Une page privée, simple et claire pour réserver vos sessions. »
          </p>
          <ul className="hidden space-y-3 text-white/70 md:block">
            <li>— Vérification par email + mot de passe.</li>
            <li>— Quotas mensuels pris en compte automatiquement.</li>
            <li>— Créneaux Belgique / Miami affichés en temps réel.</li>
          </ul>
        </div>
        <LoginForm />
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <Link
          href="/admin"
          className="text-xs uppercase tracking-widest text-white/40 hover:text-[#C8A060] transition-colors"
        >
          Admin
        </Link>
        <p className="text-xs text-white/30">
          Réalisé par{" "}
          <a
            href="https://lagencepartners.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 underline hover:text-[#C8A060] transition-colors"
          >
            L&apos;agence
          </a>
        </p>
      </div>
    </section>
  );
}



