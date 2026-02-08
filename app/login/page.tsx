export const runtime = "nodejs";

import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 md:py-24">
      <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-6">
          <p className="pill">Connexion sécurisée</p>
          <h1 className="font-[var(--font-playfair)] text-4xl uppercase tracking-wider text-white">
            Espace client
          </h1>
          <p className="italic text-lg text-white/70">
            « Une page privée, simple et claire pour réserver vos sessions. »
          </p>
          <ul className="space-y-3 text-white/70">
            <li>— Vérification par email + mot de passe.</li>
            <li>— Quotas mensuels pris en compte automatiquement.</li>
            <li>— Créneaux Brussels / Miami affichés en temps réel.</li>
          </ul>
          <Link href="/" className="text-sm underline underline-offset-4">
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/admin"
            className="text-xs uppercase tracking-widest text-white/50 underline underline-offset-4"
          >
            Admin
          </Link>
        </div>
        <LoginForm />
      </div>
    </section>
  );
}


