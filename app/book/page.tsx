export const runtime = "nodejs";

import { redirect } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { BookingViews } from "../../components/BookingViews";
import { getCurrentClient } from "../../lib/auth";
import { getAvailability, getQuotaStatus } from "../../lib/booking";
import { BRUSSELS_TZ } from "../../lib/time";
import { logoutAction } from "../login/actions";
import { prisma } from "../../lib/prisma";
import { getSettings } from "../../lib/settings";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

function getModeForDate(
  date: Date,
  sessionModes: {
    startDate: Date;
    endDate: Date;
    mode: string;
    location: string | null;
  }[],
  defaultMode: "VISIO" | "PRESENTIEL",
  defaultPresentielLocation: string
) {
  const day = DateTime.fromJSDate(date, { zone: "utc" }).setZone(BRUSSELS_TZ).startOf("day");

  const match = sessionModes.find((sessionMode) => {
    const start = DateTime.fromJSDate(sessionMode.startDate, { zone: "utc" })
      .setZone(BRUSSELS_TZ)
      .startOf("day");
    const end = DateTime.fromJSDate(sessionMode.endDate, { zone: "utc" })
      .setZone(BRUSSELS_TZ)
      .endOf("day");
    return day >= start && day <= end;
  });

  if (match) {
    return {
      mode: match.mode === "PRESENTIEL" ? "PRESENTIEL" : "VISIO",
      presentielLocation: match.mode === "PRESENTIEL" ? match.location ?? defaultPresentielLocation : undefined
    } as const;
  }

  return {
    mode: defaultMode,
    presentielLocation: defaultMode === "PRESENTIEL" ? defaultPresentielLocation : undefined
  } as const;
}

export default async function BookPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const client = await getCurrentClient();
  if (!client) redirect("/login");

  const [slots, quota, settings, sessionModes] = await Promise.all([
    getAvailability(),
    getQuotaStatus(client.id),
    getSettings(),
    prisma.sessionMode.findMany({ orderBy: { startDate: "asc" } })
  ]);

  const slotsWithModeByDate = slots.map((slot) => {
    const modeForDate = getModeForDate(
      slot.start,
      sessionModes,
      settings.defaultMode === "PRESENTIEL" ? "PRESENTIEL" : "VISIO",
      settings.presentielLocation
    );

    return {
      ...slot,
      mode: modeForDate.mode,
      presentielLocation: modeForDate.presentielLocation
    };
  });

  const quotaReached = quota.creditsUsedThisMonth >= quota.creditsPerMonth;
  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const error = rawError ? decodeURIComponent(rawError) : null;
  const success = Array.isArray(searchParams?.success)
    ? searchParams?.success[0]
    : searchParams?.success;
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
              <div>
                <div className="text-base uppercase tracking-widest text-white/60">
                  Vos credits mensuels
                </div>
                <div className="text-base font-semibold text-white">
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
      {quotaReached ? (
        <div className="alert-warning">
          Quota mensuel atteint. Contactez Geoffrey si vous avez besoin d’un créneau
          supplémentaire.
        </div>
      ) : null}

      <BookingViews slots={slotsWithModeByDate} quotaReached={quotaReached} />
    </section>
  );
}


