export const runtime = "nodejs";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRescheduleBookingAction, cancelBookingAction } from "../../actions";
import { prisma } from "../../../../lib/prisma";
import { getAdminSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

function toDateTimeLocalValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export default async function AdminBookingDetailPage({ params }: PageProps) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const bookingId = Number(params.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    notFound();
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { client: true }
  });

  if (!booking) {
    notFound();
  }

  const startInput = toDateTimeLocalValue(booking.startAt);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/availability?tab=general"
          className="text-sm text-[#C8A060] underline underline-offset-4 hover:text-[#E8D7BE]"
        >
          â† Retour aux disponibilitÃ©s
        </Link>
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Modifier le rendez-vous
        </h1>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
          Informations actuelles
        </h2>
        <div className="space-y-2 text-sm">
          <p>
            <strong>Client:</strong> {booking.client.name}
          </p>
          <p className="text-white/70">{booking.client.email}</p>
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
            -{" "}
            {new Date(booking.endAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
            })}{" "}
            (Brussels)
          </p>
          <p>
            <strong>Mode:</strong> {booking.mode}
          </p>
          <p>
            <strong>Statut:</strong> {booking.status}
          </p>
          {booking.rescheduleReason ? (
            <p className="text-white/70">
              <strong>Notes:</strong> {booking.rescheduleReason}
            </p>
          ) : null}
        </div>
      </div>

      {booking.status === "CONFIRMED" ? (
        <>
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Modifier
            </h2>
            <form action={adminRescheduleBookingAction} className="space-y-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <label className="space-y-2 text-sm">
                <span className="block text-white/60">Nouveau crÃ©neau</span>
                <input type="datetime-local" name="start" className="input" required defaultValue={startInput} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block text-white/60">Notes (optionnel)</span>
                <input
                  type="text"
                  name="reason"
                  placeholder="Motif (optionnel)"
                  className="input"
                  defaultValue={booking.rescheduleReason ?? ""}
                />
              </label>
              <button type="submit" className="btn btn-primary w-full">
                Enregistrer les modifications
              </button>
            </form>
          </div>

          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider text-red-500">
              Zone de danger
            </h2>
            <p className="text-sm text-white/70">
              Annuler ce rendez-vous rendra le crÃ©neau Ã  nouveau disponible.
            </p>
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className="btn-danger">
                Annuler ce rendez-vous
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
