export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { adminRescheduleBookingAction, cancelBookingAction } from "../actions";
import { listUpcomingBookingsThisMonth } from "../../../lib/admin";
import { formatInZone, BRUSSELS_TZ } from "../../../lib/time";
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

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Bookings
        </h1>
        <p className="text-sm text-white/70">
          Seuls les rendez-vous restants du mois en cours sont affichés. L’admin peut modifier ou annuler même à
          moins de 72h.
        </p>
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      <div className="space-y-4">
        {bookings.length === 0 ? (
          <p className="text-white/50">Aucune réservation.</p>
        ) : (
          bookings.map((booking) => (
            <div key={booking.id} className="card-gm">
              <div className="flex justify-between items-start">
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

              <div className="text-sm space-y-1">
                <p><strong>Date:</strong> {formatInZone(booking.startAt, "PPP 'à' HH:mm", BRUSSELS_TZ)} (Brussels)</p>
                <p><strong>Mode:</strong> {booking.mode}</p>
                {booking.cancelReason && (
                  <p><strong>Raison annulation:</strong> {booking.cancelReason}</p>
                )}
              </div>

              {booking.status === "CONFIRMED" ? (
                <div className="grid gap-2 pt-2 md:grid-cols-[1fr_auto] md:items-end">
                  <form action={adminRescheduleBookingAction} className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <input
                      type="datetime-local"
                      name="start"
                      className="input"
                      required
                    />
                    <input
                      type="text"
                      name="reason"
                      placeholder="Motif (optionnel)"
                      className="input md:col-span-2"
                    />
                    <button type="submit" className="btn-secondary text-sm md:col-span-3">
                      Modifier
                    </button>
                  </form>
                  <form action={cancelBookingAction}>
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button type="submit" className="btn-danger text-sm w-full">
                      Annuler
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

