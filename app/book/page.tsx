export const runtime = "nodejs";

import { redirect } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { BookingViews } from "../../components/BookingViews";
import { getCurrentClient } from "../../lib/auth";
import { getQuotaStatus } from "../../lib/booking";
import { BRUSSELS_TZ } from "../../lib/time";
import { formatTimeSlot, getAvailableTimeSlots } from "../../lib/timeSlots";
import { logoutAction } from "../login/actions";
import { prisma } from "../../lib/prisma";
import { getSettings } from "../../lib/settings";
import { getServerLocale, t } from "../../lib/i18n";

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

  const locale = await getServerLocale();

  const [allSlots, settings, sessionModes] = await Promise.all([
    getAvailableTimeSlots(),
    getSettings(),
    prisma.sessionMode.findMany({ orderBy: { startDate: "asc" } })
  ]);

  // Filter out slots less than 48h from now for clients
  const minBookingTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const slots = allSlots.filter((slot) => slot.start >= minBookingTime);

  // Compute per-month quotas so slots are only disabled for months where credits are used up
  const currentMonthQuota = await getQuotaStatus(client.id, new Date());

  // Collect unique months (BRUSSELS_TZ) from all slots
  const uniqueMonthKeys = new Set<string>();
  for (const slot of slots) {
    const dt = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(BRUSSELS_TZ);
    uniqueMonthKeys.add(`${dt.year}-${String(dt.month).padStart(2, "0")}`);
  }

  // Query quota for each month
  const quotaByMonth: Record<string, boolean> = {};
  for (const monthKey of Array.from(uniqueMonthKeys)) {
    const [year, month] = monthKey.split("-").map(Number);
    const targetDate = DateTime.fromObject({ year, month, day: 15 }, { zone: BRUSSELS_TZ }).toJSDate();
    const q = await getQuotaStatus(client.id, targetDate);
    quotaByMonth[monthKey] = q.creditsUsedThisMonth >= q.creditsPerMonth;
  }

  const slotsWithModeByDate = slots.map((slot) => {
    const modeForDate = getModeForDate(
      slot.start,
      sessionModes,
      settings.defaultMode === "PRESENTIEL" ? "PRESENTIEL" : "VISIO",
      settings.presentielLocation
    );

    return {
      ...slot,
      label: formatTimeSlot({ startTime: slot.startTime, date: slot.date }),
      mode: modeForDate.mode,
      presentielLocation: modeForDate.presentielLocation
    };
  });

  const currentMonthReached = currentMonthQuota.creditsUsedThisMonth >= currentMonthQuota.creditsPerMonth;
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
          <p className="pill w-fit">{t("book.pill", locale)}</p>
          <h1 className="font-[var(--font-playfair)] text-4xl uppercase tracking-wider md:text-5xl">
            {t("book.title", locale)}
          </h1>
          <p className="text-sm text-white/60">
            {t("book.subtitle", locale)}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-3 p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base uppercase tracking-widest text-white/60">
                  {t("book.monthlyRdv", locale)}
                </div>
                <div className="text-base font-semibold text-white">
                  {currentMonthQuota.creditsUsedThisMonth}/{currentMonthQuota.creditsPerMonth} {t("book.usedThisMonth", locale)}
                </div>
              </div>
              <form action={logoutAction} className="self-start">
                <button
                  type="submit"
                  className="text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 hover:text-white"
                >
                  {t("book.disconnect", locale)}
                </button>
              </form>
            </div>
            <p className="text-xs text-white/60">
              {t("book.blocked", locale)}
            </p>
            <Link
              href="/manage"
              className="inline-flex text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 hover:text-white"
            >
              {t("book.myRdv", locale)}
            </Link>
          </div>
        </div>
      </div>

      {success ? <div className="alert-success">{t("book.confirmed", locale)}</div> : null}
      {error ? <div className="alert-error">{error}</div> : null}
      {currentMonthReached ? (
        <div className="alert-warning">
          {t("book.quotaWarning", locale)}
        </div>
      ) : null}

      <BookingViews slots={slotsWithModeByDate} quotaReached={false} quotaByMonth={quotaByMonth} />
    </section>
  );
}
