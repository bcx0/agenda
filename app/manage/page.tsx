export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { getCurrentClient } from "../../lib/auth";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "../../lib/time";
import {
  cancelClientBookingAction,
  manageClientBookingAction
} from "../../lib/actions/bookingActions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string };

const MANAGE_WINDOW_MS = 72 * 60 * 60 * 1000;

export default async function ManagePage({ searchParams }: { searchParams?: SearchParams }) {
  const client = await getCurrentClient();
  if (!client) redirect("/login");

  const bookings = await prisma.booking.findMany({
    where: {
      clientId: client.id,
      status: { not: "CANCELLED" }
    },
    orderBy: { startAt: "asc" }
  });

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : null;

  return (
    <section className="mx-auto max-w-4xl space-y-8 px-5 py-14 md:py-20">
      <div className="space-y-2">
        <p className="pill w-fit">Espace client</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Mes rendez-vous
        </h1>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {bookings.length === 0 ? (
        <div className="card p-6 text-sm text-white/60">Aucun rendez-vous.</div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const canManage = booking.startAt.getTime() - Date.now() > MANAGE_WINDOW_MS;
            const dateLabel = formatInZone(booking.startAt, "EEEE dd LLL yyyy", BRUSSELS_TZ);
            const brussels = formatInZone(booking.startAt, "HH:mm", BRUSSELS_TZ);
            const miami = formatInZone(booking.startAt, "HH:mm", MIAMI_TZ);

            return (
              <div key={booking.id} className="card space-y-3 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{dateLabel}</div>
                    <div className="text-sm text-white/70">
                      {brussels} (Brussels) / {miami} (Miami)
                    </div>
                  </div>
                  <span className="pill">{booking.status}</span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form action={manageClientBookingAction}>
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      className={`btn btn-secondary ${
                        canManage ? "" : "cursor-not-allowed opacity-50"
                      }`}
                      disabled={!canManage}
                    >
                      Modifier
                    </button>
                  </form>

                  <form action={cancelClientBookingAction}>
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      className={`btn btn-secondary ${
                        canManage ? "" : "cursor-not-allowed opacity-50"
                      }`}
                      disabled={!canManage}
                    >
                      Annuler
                    </button>
                  </form>

                  {!canManage ? (
                    <span className="text-xs text-white/60">
                      Modification impossible (moins de 72h)
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

