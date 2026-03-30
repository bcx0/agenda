export const runtime = "nodejs";

import { cancelAppointmentAction, rescheduleAppointmentAction } from "./actions";
import { prisma } from "../../../../lib/prisma";
import { getAvailability } from "../../../../lib/booking";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "../../../../lib/time";
import { getServerLocale, t } from "../../../../lib/i18n";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { token: string };
  searchParams?: { error?: string; success?: string };
};

export default async function ManageBookingPage({ params, searchParams }: PageProps) {
  const locale = await getServerLocale();
  const token = params.token;
  const booking = await prisma.booking.findFirst({
    where: {
      manageToken: token,
      manageTokenExpiresAt: { gt: new Date() }
    },
    include: { client: true }
  });

  if (!booking) {
    return (
      <section className="mx-auto max-w-2xl space-y-4 py-12">
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("rdvManage.expired", locale)}
        </h1>
        <p className="text-sm text-white/70">
          {t("rdvManage.expiredDesc", locale)}
        </p>
      </section>
    );
  }

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const successMessage = searchParams?.success ?? null;

  const slots = await getAvailability();
  const availableSlots = slots.filter(
    (slot) =>
      slot.status === "available" &&
      slot.start.getTime() !== booking.startAt.getTime()
  );

  const bookingDate = formatInZone(booking.startAt, "EEEE dd LLL yyyy", BRUSSELS_TZ);
  const bookingBrussels = formatInZone(booking.startAt, "HH:mm", BRUSSELS_TZ);
  const bookingMiami = formatInZone(booking.startAt, "HH:mm", MIAMI_TZ);

  return (
    <section className="mx-auto max-w-3xl space-y-8 py-12">
      <div className="space-y-2">
        <p className="pill w-fit">{t("manage.pill", locale)}</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("rdvManage.title", locale)}
        </h1>
        <p className="text-sm text-white/70">
          {t("rdvManage.refFor", locale)} {booking.client.name} · {bookingDate}
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {successMessage === "cancelled" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t("rdvManage.cancelled", locale)}
        </div>
      ) : null}
      {successMessage === "rescheduled" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t("rdvManage.rescheduled", locale)}
        </div>
      ) : null}

      <div className="card space-y-2 p-6">
        <div className="text-sm text-white/60">{t("rdvManage.currentSlot", locale)}</div>
        <div className="text-lg font-semibold">
          {bookingDate} · {bookingBrussels} Brussels / {bookingMiami} Miami
        </div>
        <div className="text-xs uppercase tracking-widest text-white/60">
          {t("rdvManage.status", locale)} {booking.status} · {t("bookingDetail.mode", locale)} {booking.mode}
        </div>
        {booking.cancelReason ? (
          <div className="text-sm text-red-700">{t("rdvManage.cancelReason", locale)} {booking.cancelReason}</div>
        ) : null}
        {booking.rescheduleReason ? (
          <div className="text-sm text-primary">{t("rdvManage.rescheduleReason", locale)} {booking.rescheduleReason}</div>
        ) : null}
      </div>

      {booking.status === "CANCELLED" ? (
        <div className="rounded-md border border-border bg-white/5 px-4 py-3 text-sm text-white/70">
          {t("rdvManage.alreadyCancelled", locale)}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <form action={cancelAppointmentAction} className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("rdvManage.cancel", locale)}
            </h2>
            <p className="text-sm text-white/70">
              {t("rdvManage.cancelDesc", locale)}
            </p>
            <input type="hidden" name="token" value={token} />
            <button className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100">
              {t("rdvManage.confirmCancel", locale)}
            </button>
          </form>

          <form action={rescheduleAppointmentAction} className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("rdvManage.modify", locale)}
            </h2>
            <p className="text-sm text-white/70">
              {t("rdvManage.modifyDesc", locale)}
            </p>
            <input type="hidden" name="token" value={token} />
            <label className="space-y-2 text-sm">
              <span className="block text-white/60">{t("rdvManage.newSlot", locale)}</span>
              <select
                name="start"
                required
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                <option value="">{t("rdvManage.selectSlot", locale)}</option>
                {availableSlots.map((slot) => {
                  const label = `${formatInZone(slot.start, "dd LLL yyyy HH:mm", BRUSSELS_TZ)} Brussels / ${formatInZone(slot.start, "HH:mm", MIAMI_TZ)} Miami`;
                  return (
                    <option key={slot.start.toISOString()} value={slot.start.toISOString()}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            {availableSlots.length === 0 ? (
              <p className="text-sm text-white/60">{t("rdvManage.noSlotAvailable", locale)}</p>
            ) : null}
            <button className="rounded-md border border-border px-4 py-2 text-sm hover:bg-black hover:text-white">
              {t("rdvManage.confirmModify", locale)}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
