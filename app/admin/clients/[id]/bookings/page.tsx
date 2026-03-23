export const runtime = "nodejs";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
};

function getStatusClasses(status: string) {
  if (status === "CONFIRMED") return "bg-success";
  if (status === "DONE") return "bg-primary";
  if (status === "NO_SHOW") return "bg-warning";
  if (status === "CANCELLED") return "bg-danger";
  return "bg-white/20";
}

function formatMode(mode: string) {
  if (mode === "PRESENTIEL") return "Présentiel";
  return "Visio";
}

export default async function ClientBookingsPage({ params }: Props) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const clientId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(clientId)) notFound();

  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!client) notFound();

  const bookings = await prisma.booking.findMany({
    where: { clientId },
    orderBy: { startAt: "desc" },
    include: { client: true }
  });

  return (
    <section className="space-y-6">
      <div>
        <Link
          href="/admin/clients"
          className="text-sm text-primary transition-colors hover:text-primary-light"
        >
          ← Retour aux clients
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Rendez-vous de {client.name}
        </h1>
        <p className="text-sm text-white/50">
          ID: {client.id} • {client.email}
        </p>
      </div>

      {bookings.length > 0 ? (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="card-gm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-lg font-semibold">
                    {new Date(booking.startAt).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    })}
                  </p>
                  <p className="text-white/70">
                    {new Date(booking.startAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}{" "}
                    -{" "}
                    {new Date(booking.endAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                  <p className="text-sm text-white/50">Mode: {formatMode(booking.mode)}</p>
                  {booking.rescheduleReason ? (
                    <p className="text-sm text-white/50">Notes: {booking.rescheduleReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded px-3 py-1 text-xs font-semibold text-white ${getStatusClasses(booking.status)}`}
                  >
                    {booking.status}
                  </span>
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="text-sm text-primary transition-colors hover:text-primary-light"
                  >
                    Modifier →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-gm py-12 text-center">
          <p className="text-lg text-white/50">Aucun rendez-vous pour ce client</p>
          <Link href="/admin/availability?tab=single-block" className="btn btn-primary mt-4 inline-flex">
            Réserver un RDV pour ce client
          </Link>
        </div>
      )}
    </section>
  );
}
