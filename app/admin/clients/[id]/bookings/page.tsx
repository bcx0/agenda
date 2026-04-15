export const runtime = "nodejs";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/prisma";
import { getServerLocale, t, translateStatus, translateMode } from "../../../../../lib/i18n";

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

export default async function ClientBookingsPage({ params }: Props) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const locale = await getServerLocale();

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
          ← {t("clientBookings.backToClients", locale)}
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("clientBookings.bookingsOf", locale)} {client.name}
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
                    {new Date(booking.startAt).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Europe/Brussels"
                    })}
                  </p>
                  <p className="text-white/70">
                    {new Date(booking.startAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Brussels"
                    })}{" "}
                    -{" "}
                    {new Date(booking.endAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Brussels"
                    })}
                  </p>
                  <p className="text-sm text-white/50">{t("bookingDetail.mode", locale)}: {translateMode(booking.mode, locale)}</p>
                  {booking.rescheduleReason ? (
                    <p className="text-sm text-white/50">{t("bookingDetail.notes", locale)}: {booking.rescheduleReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded px-3 py-1 text-xs font-semibold text-white ${getStatusClasses(booking.status)}`}
                  >
                    {translateStatus(booking.status, locale)}
                  </span>
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="text-sm text-primary transition-colors hover:text-primary-light"
                  >
                    {t("clientBookings.modify", locale)} →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-gm py-12 text-center">
          <p className="text-lg text-white/50">{t("clientBookings.noBookings", locale)}</p>
          <Link href="/admin/availability?tab=single-block" className="btn btn-primary mt-4 inline-flex">
            {t("clientBookings.bookFor", locale)}
          </Link>
        </div>
      )}
    </section>
  );
}
