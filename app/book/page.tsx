export const runtime = "nodejs";

import { redirect } from "next/navigation";
import Link from "next/link";
import DualClock from "../../components/DualClock";
import { BookingViews } from "../../components/BookingViews";
import { getCurrentClient } from "../../lib/auth";
import { getAvailability, getQuotaStatus, getUpcomingBookingForClient } from "../../lib/booking";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "../../lib/time";
import { logoutAction } from "../login/actions";
import { manageBookingAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

export default async function BookPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const client = await getCurrentClient();
  if (!client) redirect("/login");

  const [slots, quota, upcomingBooking] = await Promise.all([
    getAvailability(),
    getQuotaStatus(client.id),
    getUpcomingBookingForClient(client.id)
  ]);

  const quotaReached = quota.creditsUsedThisMonth >= quota.creditsPerMonth;
  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const error = rawError ? decodeURIComponent(rawError) : null;
  const success = Array.isArray(searchParams?.success)
    ? searchParams?.success[0]
    : searchParams?.success;
  const canManage = upcomingBooking
    ? upcomingBooking.startAt.getTime() - Date.now() > 72 * 60 * 60 * 1000
    : false;

  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-14 md:py-20">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="pill w-fit">Espace client</p>
          <h1 className="font-[var(--font-playfair)] text-4xl uppercase tracking-wider md:text-5xl">
            PRENDRE RENDEZ-VOUS
          </h1>
          <p className="text-sm text-white/60">
            Les créneaux occupés restent anonymes. Aucun rappel automatique ne sera envoyé.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-3 p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-white/60">Heures locales</div>
              <span className="rounded-full bg-background-elevated/5 px-2 py-1 text-[11px] text-white/60">
                Disponibilités
              </span>
            </div>
            <DualClock />
            <p className="text-xs text-white/60">
              Disponibilités basées sur les règles hebdo + exceptions. Les heures Brussels / Miami sont affichées en conversion.
            </p>
          </div>

          <div className="card space-y-3 p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/60">
                  Vos credits mensuels
                </div>
                <div className="text-2xl font-semibold text-white">
                  {quota.creditsUsedThisMonth}/{quota.creditsPerMonth} utilises ce mois-ci
                </div>
              </div>
              <form action={logoutAction} className="self-start">
                <button
                  type="submit"
                  className="text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 hover:text-white"
                >
                  Deconnexion
                </button>
              </form>
            </div>
            <p className="text-xs text-white/60">
              Les credits sont bloques apres le quota mensuel. Pour un besoin exceptionnel, contactez Geoffrey.
            </p>
            <Link
              href="/manage"
              className="inline-flex text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 hover:text-white"
            >
              Mes RDV
            </Link>
          </div>
        </div>
      </div>

      {success ? <div className="alert-success">Rendez-vous confirme.</div> : null}
      {error ? <div className="alert-error">{error}</div> : null}

      <div className="card space-y-3 p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-white/60">Mon rendez-vous</div>
          {upcomingBooking ? (
            <span className="text-xs uppercase tracking-widest text-white/50">
              {upcomingBooking.mode}
            </span>
          ) : null}
        </div>

        {upcomingBooking ? (
          <>
            <div className="text-lg font-semibold">
              {formatInZone(upcomingBooking.startAt, "EEEE dd LLL yyyy", BRUSSELS_TZ)} ·{" "}
              {formatInZone(upcomingBooking.startAt, "HH:mm", BRUSSELS_TZ)} (Brussels) /{" "}
              {formatInZone(upcomingBooking.startAt, "HH:mm", MIAMI_TZ)} (Miami)
            </div>
            <div className="text-xs uppercase tracking-widest text-white/60">
              Statut : {upcomingBooking.status}
            </div>
            {upcomingBooking.status === "CANCELLED" ? (
              <div className="text-sm text-white/60">Votre rendez-vous a été annulé.</div>
            ) : (
              <div className="space-y-2 pt-2">
                <form action={manageBookingAction}>
                  <button
                    type="submit"
                    className={`btn btn-secondary w-full ${
                      canManage ? "" : "cursor-not-allowed opacity-50"
                    }`}
                    disabled={!canManage}
                  >
                    Modifier / Annuler mon RDV
                  </button>
                </form>
                {!canManage ? (
                  <p className="text-xs text-white/60">
                    La modification ou l'annulation est possible uniquement jusqu'a 72h avant le
                    rendez-vous.
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-white/60">Aucun rendez-vous planifié.</p>
        )}
      </div>

      {quotaReached ? (
        <div className="alert-warning">
          Quota mensuel atteint. Contactez Geoffrey si vous avez besoin d’un créneau
          supplémentaire.
        </div>
      ) : null}

      <BookingViews slots={slots} quotaReached={quotaReached} />
    </section>
  );
}


