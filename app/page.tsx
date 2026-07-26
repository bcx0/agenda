import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agenda Geoffrey Mahieu — Prise de rendez-vous",
  description:
    "Agenda Geoffrey Mahieu : l'espace de prise de rendez-vous des clients de Geoffrey Mahieu, coach mental. Réservation en ligne synchronisée avec Google Calendar."
};

/**
 * Page d'accueil publique. Exigée par la validation OAuth Google :
 * elle doit afficher le nom exact de l'application ("Agenda Geoffrey
 * Mahieu", identique à l'écran de consentement) et expliquer son objectif
 * sans nécessiter de connexion.
 */
export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl space-y-10 px-5 py-14 md:py-20">
      <div className="space-y-4">
        <p className="pill w-fit">Espace client</p>
        <h1 className="font-[var(--font-playfair)] text-4xl uppercase tracking-wider">
          Agenda Geoffrey Mahieu
        </h1>
        <p className="text-lg text-[#5A6B76]">
          L&apos;espace de prise de rendez-vous des clients de{" "}
          <a
            href="https://www.geoffreymahieu.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Geoffrey Mahieu
          </a>
          , coach mental.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Ce que permet cette application</h2>
        <ul className="list-disc space-y-2 pl-6 text-[#5A6B76]">
          <li>
            <strong>Réserver, déplacer ou annuler vos séances</strong> de coaching mental en
            ligne, selon les disponibilités réelles de Geoffrey.
          </li>
          <li>
            <strong>Synchronisation automatique avec Google Calendar</strong> : chaque
            rendez-vous pris ici est ajouté à l&apos;agenda Google du coach, et ses
            indisponibilités sont reflétées en temps réel — aucun risque de double
            réservation.
          </li>
          <li>
            <strong>Confirmations par e-mail</strong> et lien de gestion pour chaque
            rendez-vous.
          </li>
        </ul>
        <p className="text-sm text-[#5A6B76]">
          L&apos;accès est réservé aux clients sous contrat. Pour découvrir
          l&apos;accompagnement de Geoffrey, rendez-vous sur{" "}
          <a
            href="https://www.geoffreymahieu.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            geoffreymahieu.com
          </a>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className="btn btn-primary text-center">
          Se connecter à l&apos;espace client
        </Link>
        <Link
          href="/confidentialite"
          className="btn text-center text-[#5A6B76] underline hover:text-[#10222E]"
        >
          Politique de confidentialité
        </Link>
      </div>

      <p className="text-xs text-[#8A98A1]">
        Agenda Geoffrey Mahieu is the private appointment-booking application for clients of
        Geoffrey Mahieu, mental coach. Appointments booked here are synchronized two-way with
        the coach&apos;s Google Calendar. See our{" "}
        <Link href="/confidentialite" className="underline">
          privacy policy
        </Link>{" "}
        for details on data usage.
      </p>
    </section>
  );
}
