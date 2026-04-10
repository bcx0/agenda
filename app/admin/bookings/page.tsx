export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { listUpcomingBookingsThisMonth } from "../../../lib/admin";
import { getAdminSession } from "../../../lib/session";
import { getServerLocale, t } from "../../../lib/i18n";
import BookingsList from "./BookingsList";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string };

export default async function AdminBookingsPage({ searchParams }: { searchParams?: SearchParams }) {
    const session = getAdminSession();
    if (!session) redirect("/admin?error=unauthorized");

  const locale = await getServerLocale();

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

  const serializedBookings = bookings.map((b: any) => ({
        id: b.id,
        startAt: new Date(b.startAt).toISOString(),
        status: b.status,
        mode: b.mode,
        cancelReason: b.cancelReason,
        googleEventId: b.googleEventId,
        client: { id: b.client.id, name: b.client.name, email: b.client.email },
  }));

  return (
        <section className="space-y-6">
              <div className="space-y-2">
                      <p className="pill w-fit">{t("common.admin", locale)}</p>
                      <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
                        {t("bookings.title", locale)}
                      </h1>
                      <p className="text-sm text-white/70">
                        {t("bookings.subtitle", locale)}
                      </p>
              </div>
        
              <div className="card space-y-4 p-6">
                      <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
                        {t("ical.title", locale)}
                      </h2>
                      <div className="space-y-3 text-sm text-white/70">
                                <p>{t("ical.url", locale)}</p>
                                <code className="block break-all rounded-md border border-border bg-background-elevated px-3 py-2 text-xs text-primary">
                                  {feedUrl}
                                </code>
                                <ol className="list-decimal space-y-1 pl-5">
                                            <li>{t("ical.step1", locale)}</li>
                                            <li>{t("ical.step2", locale)}</li>
                                            <li>{t("ical.step3", locale)}</li>
                                            <li>{t("ical.step4", locale)}</li>
                                </ol>
                      </div>
              </div>
        
              <BookingsList bookings={serializedBookings} errorMessage={errorMessage} />
        </section>
      );
}</section>
