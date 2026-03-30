export const runtime = "nodejs";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRescheduleBookingAction, cancelBookingAction } from "../../actions";
import { prisma } from "../../../../lib/prisma";
import { getAdminSession } from "../../../../lib/session";
import { getServerLocale, t, translateStatus, translateMode } from "../../../../lib/i18n";

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

  const locale = await getServerLocale();

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
          className="text-sm text-primary underline underline-offset-4 hover:text-primary-light"
        >
          ← {t("bookingDetail.backToAvailability", locale)}
        </Link>
        <p className="pill w-fit">{t("common.admin", locale)}</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("bookingDetail.title", locale)}
        </h1>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
          {t("bookingDetail.currentInfo", locale)}
        </h2>
        <div className="space-y-2 text-sm">
          <p>
            <strong>{t("bookingDetail.client", locale)}</strong> {booking.client.name}
          </p>
          <p className="text-white/70">{booking.client.email}</p>
          <p>
            <strong>{t("bookingDetail.date", locale)}</strong>{" "}
            {new Date(booking.startAt).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric"
            })}{" "}
            à{" "}
            {new Date(booking.startAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
            })}{" "}
            -{" "}
            {new Date(booking.endAt).toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
            })}{" "}
            Brussels
          </p>
          <p>
            <strong>{t("bookingDetail.mode", locale)}</strong> {translateMode(booking.mode, locale)}
          </p>
          <p>
            <strong>{t("bookingDetail.status", locale)}</strong> {translateStatus(booking.status, locale)}
          </p>
          {booking.rescheduleReason ? (
            <p className="text-white/70">
              <strong>{t("bookingDetail.notes", locale)}</strong> {booking.rescheduleReason}
            </p>
          ) : null}
        </div>
      </div>

      {booking.status === "CONFIRMED" ? (
        <>
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("bookingDetail.modify", locale)}
            </h2>
            <form action={adminRescheduleBookingAction} className="space-y-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <label className="space-y-2 text-sm">
                <span className="block text-white/60">{t("bookingDetail.newSlot", locale)}</span>
                <input type="datetime-local" name="start" className="input" required defaultValue={startInput} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block text-white/60">{t("bookingDetail.notesOptional", locale)}</span>
                <input
                  type="text"
                  name="reason"
                  placeholder={t("bookingDetail.reason", locale)}
                  className="input"
                  defaultValue={booking.rescheduleReason ?? ""}
                />
              </label>
              <button type="submit" className="btn btn-primary w-full">
                {t("bookingDetail.save", locale)}
              </button>
            </form>
          </div>

          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider text-red-500">
              {t("bookingDetail.dangerZone", locale)}
            </h2>
            <p className="text-sm text-white/70">
              {t("bookingDetail.cancelDesc", locale)}
            </p>
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className="btn-danger">
                {t("bookingDetail.cancelBooking", locale)}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
