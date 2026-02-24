export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { adminRescheduleBookingAction, cancelBookingAction } from "../actions";
import { listUpcomingBookingsThisMonth } from "../../../lib/admin";
import { getAdminSession } from "../../../lib/session";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string };

export default async function AdminBookingsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : undefined;

  const bookings = await listUpcomingBookingsThisMonth();
  const hdrs = headers();
  const forwardedProto = hdrs.get("x-forwarded-proto");
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const originFromRequest = host ? `${forwardedProto ?? "https"}://${host}` : null;
  const appUrl =
    process.env.APP_URL?.replace(/\/$/, "") ??
    originFromRequest ??
    "https://agenda-geoffreymahieu.vercel.app";
  const feedToken = process.env.ADMIN_CALENDAR_TOKEN;
  const feedUrl = feedToken
    ? `${appUrl}/api/calendar/feed?token=${encodeURIComponent(feedToken)}`
    : `${appUrl}/api/calendar/feed`;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">Bookings</h1>
        <p className="text-sm text-white/70">
          Seuls les rendez-vous restants du mois en cours sont affichés. L&apos;admin peut modifier
          ou annuler même à moins de 72h.
        </p>
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      <div className="card space-y-4 p-6">
        <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
          S&apos;abonner au calendrier Apple
        </h2>
        <div className="space-y-3 text-sm text-white/70">
          <p>URL du flux iCal:</p>
          <code className="block break-all rounded-md border border-border bg-background-elevated px-3 py-2 text-xs text-[#C8A060]">
            {feedUrl}
          </code>
          <ol className="list-decimal space-y-1 pl-5">
            <li>iPhone: Reglages -&gt; Calendrier -&gt; Comptes</li>
            <li>Ajouter un compte -&gt; Autre -&gt; S&apos;abonner a un calendrier</li>
            <li>Coller l&apos;URL ci-dessus puis valider</li>
            <li>Les reservations confirmees futures se synchronisent automatiquement</li>
          </ol>
        </div>
      </div>

      {bookings.length === 0 ? <p className="text-white/50">Aucune réservation.</p> : null}

      <div className="space-y-4 md:hidden">
        {bookings.map((booking) => (
          <article key={booking.id} className="card-gm p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">{booking.client.name}</h3>
                <p className="mt-1 truncate text-sm text-white/70">{booking.client.email}</p>
                <p className="mt-1 text-sm text-white/70">
                  {new Date(booking.startAt).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short"
                  })}
                </p>
                <p className="text-sm text-white/70">
                  {new Date(booking.startAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
              <span
                className={`rounded px-3 py-1 text-xs font-semibold text-white ${
                  booking.status === "CONFIRMED"
                    ? "bg-green-600"
                    : booking.status === "NO_SHOW"
                    ? "bg-yellow-600"
                    : booking.status === "DONE"
                    ? "bg-blue-600"
                    : "bg-red-600"
                }`}
              >
                {booking.status}
              </span>
            </div>
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="touch-target block w-full rounded-md bg-[#C8A060] py-3 text-center text-sm font-semibold text-black"
            >
              Voir les détails
            </Link>
          </article>
        ))}
      </div>

      <div className="hidden space-y-4 md:block">
        {bookings.map((booking) => (
          <div key={booking.id} className="card-gm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{booking.client.name}</p>
                <p className="text-sm text-white/70">{booking.client.email}</p>
              </div>
              <span
                className={
                  booking.status === "CONFIRMED"
                    ? "status-confirmed"
                    : booking.status === "CANCELLED"
                    ? "status-cancelled"
                    : booking.status === "NO_SHOW"
                    ? "status-noshow"
                    : "status-done"
                }
              >
                {booking.status}
              </span>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                <strong>Date:</strong>{" "}
                {new Date(booking.startAt).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}{" "}
                à{" "}
                {new Date(booking.startAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}{" "}
                (Brussels)
              </p>
              <p>
                <strong>Mode:</strong> {booking.mode}
              </p>
              {booking.cancelReason && (
                <p>
                  <strong>Raison annulation:</strong> {booking.cancelReason}
                </p>
              )}
            </div>

            {booking.status === "CONFIRMED" ? (
              <div className="grid gap-2 pt-2 md:grid-cols-[1fr_auto] md:items-end">
                <form action={adminRescheduleBookingAction} className="grid gap-2 md:grid-cols-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <input type="datetime-local" name="start" className="input" required />
                  <input
                    type="text"
                    name="reason"
                    placeholder="Motif (optionnel)"
                    className="input md:col-span-2"
                  />
                  <button type="submit" className="btn-secondary touch-target text-sm md:col-span-3">
                    Modifier
                  </button>
                </form>
                <form action={cancelBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button type="submit" className="btn-danger touch-target w-full text-sm">
                    Annuler
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
