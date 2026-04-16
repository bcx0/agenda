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
import { getServerLocale, t, type TranslationKey } from "../../lib/i18n";
import { AgencyBranding } from "../../components/AgencyBranding";

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

  // Build the next 4 months starting from current month
  const nowBrussels = DateTime.now().setZone(BRUSSELS_TZ);
  const next4Months = Array.from({ length: 4 }, (_, i) => {
    const m = nowBrussels.plus({ months: i });
    return { year: m.year, month: m.month };
  });

  const [allSlots, settings, sessionModes, ...next4QuotaResults] = await Promise.all([
    getAvailableTimeSlots(),
    getSettings(),
    prisma.sessionMode.findMany({ orderBy: { startDate: "asc" } }),
    ...next4Months.map(({ year, month }) => {
      const targetDate = DateTime.fromObject({ year, month, day: 15 }, { zone: BRUSSELS_TZ }).toJSDate();
      return getQuotaStatus(client.id, targetDate);
    })
  ]);

  // Build rolling 4-month credit info
  const monthlyCredits = next4Months.map(({ year, month }, i) => {
    const q = next4QuotaResults[i];
    const remaining = Math.max(0, q.creditsPerMonth - q.creditsUsedThisMonth);
    return { year, month, remaining, total: q.creditsPerMonth, used: q.creditsUsedThisMonth };
  });

  // Current month quota for the warning
  const currentMonthQuota = next4QuotaResults[0];

  // Filter out slots less than 48h from now for clients
  const minBookingTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const slots = allSlots.filter((slot) => slot.start >= minBookingTime);

  // Collect unique months (BRUSSELS_TZ) from all slots
  const uniqueMonthKeys = new Set<string>();
  for (const slot of slots) {
    const dt = DateTime.fromJSDate(slot.start, { zone: "utc" }).setZone(BRUSSELS_TZ);
    uniqueMonthKeys.add(`${dt.year}-${String(dt.month).padStart(2, "0")}`);
  }

  // Query quota for each month — all in parallel
  const monthKeysArray = Array.from(uniqueMonthKeys);
  const quotaResults = await Promise.all(
    monthKeysArray.map((monthKey) => {
      const [year, month] = monthKey.split("-").map(Number);
      const targetDate = DateTime.fromObject({ year, month, day: 15 }, { zone: BRUSSELS_TZ }).toJSDate();
      return getQuotaStatus(client.id, targetDate);
    })
  );
  const quotaByMonth: Record<string, boolean> = {};
  monthKeysArray.forEach((key, i) => {
    quotaByMonth[key] = quotaResults[i].creditsUsedThisMonth >= quotaResults[i].creditsPerMonth;
  });

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
              <div className="text-xs uppercase tracking-widest text-white/60">
                {t("book.yourCredits", locale)}
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
            <div className="space-y-1.5 text-sm text-white/80">
              {monthlyCredits.map((mc) => {
                const monthName = t(`month.${mc.month}` as TranslationKey, locale);
                const creditsLabel = mc.remaining <= 0
                  ? t("book.noCredits", locale)
                  : mc.remaining === 1
                    ? `${mc.remaining} ${t("book.creditRemaining", locale)}`
                    : `${mc.remaining} ${t("book.creditsRemaining", locale)}`;
                return (
                  <div key={`${mc.year}-${mc.month}`} className={mc.remaining <= 0 ? "text-white/40" : ""}>
                    {t("book.inMonth", locale)} <span className="font-semibold capitalize">{monthName}</span>{locale === "fr" ? " il vous reste " : ": "}<span className={mc.remaining <= 0 ? "text-red-400" : "text-[#C8A060]"}>{creditsLabel}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 pt-1">
              <p className="text-xs text-white/40">
                {t("book.blocked", locale)}
              </p>
            </div>
            <Link
              href="/manage"
              className="inline-flex text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 hover:text-white"
            >
              {t("book.myRdv", locale)}
            </Link>
          </div>
          <AgencyBranding />
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

// chore: trigger redeploy
