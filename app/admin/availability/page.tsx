export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  blockDateForClientAction,
  cancelBlockedDateAction,
  createAvailabilityOverrideAction,
  createAvailabilityRuleAction,
  deleteAvailabilityOverrideAction,
  createRecurringBlockAction,
  deleteAvailabilityRuleAction,
  deleteRecurringBlockAction,
  deleteBlockAction
} from "../actions";
import {
  listAvailabilityOverrides,
  listAvailabilityRules,
  listBlocks,
  clientUsageThisMonth,
  listClients,
  listRecurringBlocks
} from "../../../lib/admin";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "../../../lib/time";
import { getAdminSession } from "../../../lib/session";
import { getAvailability } from "../../../lib/booking";
import { prisma } from "../../../lib/prisma";
import { getServerLocale, t, translateStatus, type Locale } from "../../../lib/i18n";
import AdminGeneralAvailability from "./AdminGeneralAvailability";

export const dynamic = "force-dynamic";

type PageSearchParams = {
  error?: string | string[];
  success?: string | string[];
  tab?: string | string[];
};


const ADMIN_BLOCK_NOTE_PREFIX = "[ADMIN_BLOCK]";
const HALF_HOUR_OPTIONS = [
  "00:00",
  "01:00",
  "02:00",
  "03:00",
  "04:00",
  "05:00",
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00"
];

function tabLink(tab: string, label: string, active: boolean) {
  const base =
    "whitespace-nowrap rounded-full border px-3 py-2 text-xs uppercase tracking-widest transition";
  const classes = active
    ? "border-border bg-black text-white"
    : "border-border text-white/60 hover:border-border";
  return (
    <Link href={`/admin/availability?tab=${tab}`} className={`${base} ${classes}`}>
      {label}
    </Link>
  );
}

export default async function AdminAvailabilityPage({
  searchParams
}: {
  searchParams?: PageSearchParams;
}) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const locale = await getServerLocale();

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : undefined;
  const rawSuccess = Array.isArray(searchParams?.success)
    ? searchParams?.success[0]
    : searchParams?.success;
  const successMessage = rawSuccess ? decodeURIComponent(rawSuccess) : undefined;
  const tab = searchParams?.tab ?? "general";

  // Load bookings for the full calendar view: 30 days back + 365 days ahead
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 30);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 365);
  rangeEnd.setHours(23, 59, 59, 999);

  const [rules, overrides, recurringBlocks, legacyBlocks, clients, slots, usageMap, upcomingBlockedDates, upcomingBookings] = await Promise.all([
    listAvailabilityRules(),
    listAvailabilityOverrides(),
    listRecurringBlocks(),
    listBlocks(),
    listClients(),
    getAvailability(),
    clientUsageThisMonth(),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startAt: { gte: rangeStart, lte: rangeEnd },
        rescheduleReason: { startsWith: ADMIN_BLOCK_NOTE_PREFIX }
      },
      include: { client: true },
      orderBy: { startAt: "asc" }
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startAt: { gte: rangeStart, lte: rangeEnd }
      },
      include: { client: true },
      orderBy: { startAt: "asc" }
    })
  ]);

  const weekDays = [1, 2, 3, 4, 5, 6, 7].map(v => ({ value: v, label: t(`dayName.${v}` as any, locale) }));

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">{t("common.admin", locale)}</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("avail.tabAgenda", locale)}
        </h1>
        <p className="text-sm text-white/70">
          {t("avail.calendarView", locale)}
        </p>
      </div>

      {errorMessage ? <div className="alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="alert-success">{successMessage}</div> : null}

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabLink("general", t("avail.tabAgenda", locale), tab === "general")}
        {tabLink("weekly", t("avail.tabWeekly", locale), tab === "weekly")}
        {tabLink("single-block", t("avail.tabSingleBlock", locale), tab === "single-block")}
        {tabLink("recurring", t("avail.tabRecurring", locale), tab === "recurring")}
        {tabLink("overrides", t("avail.tabOverrides", locale), tab === "overrides")}
      </div>

      {tab === "general" ? (
        <AdminGeneralAvailability
          slots={slots}
          bookings={upcomingBookings}
          rules={rules}
          overrides={overrides
            .filter((o: any) => o.type === "OPEN")
            .map((o: any) => ({
              id: o.id,
              date: o.date.toISOString(),
              startTime: o.startTime,
              endTime: o.endTime,
              type: "OPEN" as const
            }))}
        />
      ) : null}

      {tab === "weekly" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.myFixedHours", locale)}
            </h2>
            <form action={createAvailabilityRuleAction} className="grid gap-3 md:grid-cols-3">
              <select name="dayOfWeek" className="input" required>
                {weekDays.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <select name="startTime" className="input" required>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`weekly-start-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <select name="endTime" className="input" required>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`weekly-end-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary md:col-span-3">
                {t("avail.addRule", locale)}
              </button>
            </form>
            {rules.length === 0 ? (
              <p className="text-xs text-white/60">
                {t("avail.noRule", locale)}
              </p>
            ) : null}
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.existingRules", locale)}
            </h3>
            {rules.length === 0 ? (
              <p className="text-sm text-white/60">{t("avail.noRuleShort", locale)}</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule: any) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {weekDays.find((d) => d.value === rule.dayOfWeek)?.label} ·{" "}
                        {rule.startTime} → {rule.endTime} Brussels
                      </div>
                    </div>
                    <form action={deleteAvailabilityRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        {t("avail.delete", locale)}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "single-block" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.bookRdv", locale)}
            </h2>
            <form action={blockDateForClientAction} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-widest text-white/60">{t("avail.client", locale)}</label>
                <select name="clientId" required className="input">
                  <option value="">{t("avail.selectClient", locale)}</option>
                  {clients.map((client: any) => {
                    const used = (usageMap.get(client.id) ?? 0) as number;
                    const credits = (client.creditsPerMonth as number);
                    const remaining = Math.max(credits - used, 0);
                    return (
                      <option key={client.id} value={client.id}>
                        {client.name} ({remaining} {t("avail.rdvRemaining", locale)})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/60">{t("avail.date", locale)}</label>
                <input type="date" name="date" className="input" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/60">
                  {t("avail.startTime", locale)}
                </label>
                <select name="startTime" className="input" required>
                  <option value="">{t("avail.select", locale)}</option>
                  {HALF_HOUR_OPTIONS.map((time) => (
                    <option key={`block-start-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/60">{t("avail.endTime", locale)}</label>
                <select name="endTime" className="input" required>
                  <option value="">{t("avail.select", locale)}</option>
                  {HALF_HOUR_OPTIONS.map((time) => (
                    <option key={`block-end-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-widest text-white/60">
                  {t("avail.notesOptional", locale)}
                </label>
                <textarea
                  name="note"
                  rows={3}
                  className="input"
                  placeholder={t("avail.noteInternalPlaceholder", locale)}
                />
              </div>
              <button type="submit" className="btn btn-primary md:col-span-2">
                {t("avail.blockSlot", locale)}
              </button>
            </form>
          </div>

          <div className="card space-y-4 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.upcomingBlocked", locale)}
            </h3>
            {upcomingBlockedDates.length === 0 ? (
              <p className="text-sm text-white/60">{t("avail.noBlocked", locale)}</p>
            ) : (
              <div className="space-y-3">
                {upcomingBlockedDates.map((booking: any) => {
                  const rawNote = booking.rescheduleReason ?? "";
                  const note = rawNote.replace(ADMIN_BLOCK_NOTE_PREFIX, "").trim();
                  return (
                    <div
                      key={booking.id}
                      className="rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold">{booking.client.name}</p>
                        <p className="text-sm text-white/70">
                          {formatInZone(booking.startAt, "dd LLL yyyy", BRUSSELS_TZ)} •{" "}
                          {formatInZone(booking.startAt, "HH:mm", BRUSSELS_TZ)} -{" "}
                          {formatInZone(booking.endAt, "HH:mm", BRUSSELS_TZ)} Brussels
                        </p>
                        <p className="text-xs text-white/60">
                          {formatInZone(booking.startAt, "HH:mm", MIAMI_TZ)} -{" "}
                          {formatInZone(booking.endAt, "HH:mm", MIAMI_TZ)} Miami
                        </p>
                        {note ? <p className="mt-1 text-sm text-white/50">{note}</p> : null}
                      </div>
                      <form action={cancelBlockedDateAction} className="mt-3 md:mt-0">
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <button type="submit" className="btn-ghost text-red-500 text-sm">
                          {t("avail.cancelBtn", locale)}
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "overrides" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.blockedRdv", locale)}
            </h2>
            <form action={createAvailabilityOverrideAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
              <input type="date" name="date" className="input" required />
              <select name="startTime" className="input" required>
                <option value="">{t("avail.startHour", locale)}</option>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`override-start-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <select name="endTime" className="input" required>
                <option value="">{t("avail.endHour", locale)}</option>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`override-end-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <select name="type" className="input" required>
                <option value="BLOCK">{t("avail.block", locale)}</option>
                <option value="OPEN">{t("avail.open", locale)}</option>
              </select>
              <input
                type="text"
                name="note"
                placeholder={t("avail.noteOptional", locale)}
                className="input sm:col-span-2 md:col-span-5"
              />
              <button type="submit" className="btn btn-primary sm:col-span-2 md:col-span-5">
                {t("avail.add", locale)}
              </button>
            </form>
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.existingExceptions", locale)}
            </h3>
            {overrides.length === 0 ? (
              <p className="text-sm text-white/60">{t("avail.noException", locale)}</p>
            ) : (
              <div className="space-y-2">
                {overrides.map((override: any) => (
                  <div
                    key={override.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {formatInZone(override.date, "dd LLL yyyy", BRUSSELS_TZ)} ·{" "}
                        {override.startTime} → {override.endTime} Brussels
                      </div>
                      <div className="text-white/60">
                        {override.type === "OPEN" ? t("avail.opening", locale) : t("avail.blocking", locale)} ·{" "}
                        {formatInZone(override.date, "dd LLL yyyy", MIAMI_TZ)} Miami
                      </div>
                      {override.note ? (
                        <div className="text-xs text-white/60">{t("avail.note", locale)}: {override.note}</div>
                      ) : null}
                    </div>
                    <form action={deleteAvailabilityOverrideAction}>
                      <input type="hidden" name="overrideId" value={override.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        {t("avail.delete", locale)}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>

          {legacyBlocks.length > 0 ? (
            <div className="card space-y-3 p-6">
              <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
                {t("avail.legacyBlocks", locale)}
              </h3>
              <div className="space-y-2">
                {legacyBlocks.map((block: any) => (
                  <div
                    key={block.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {formatInZone(block.startAt, "dd LLL yyyy HH:mm", BRUSSELS_TZ)} →{" "}
                        {formatInZone(block.endAt, "HH:mm", BRUSSELS_TZ)} Brussels
                      </div>
                      <div className="text-white/60">
                        {formatInZone(block.startAt, "HH:mm", MIAMI_TZ)} →{" "}
                        {formatInZone(block.endAt, "HH:mm", MIAMI_TZ)} Miami
                      </div>
                      {block.reason ? (
                        <div className="text-xs text-white/60">{t("avail.reason", locale)}: {block.reason}</div>
                      ) : null}
                    </div>
                    <form action={deleteBlockAction}>
                      <input type="hidden" name="blockId" value={block.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        {t("avail.delete", locale)}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "recurring" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.recurringRdv", locale)}
            </h2>
            <form action={createRecurringBlockAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <select name="dayOfWeek" className="input" required>
                {weekDays.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <select name="startTime" className="input" required>
                <option value="">{t("avail.selectHour", locale)}</option>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`start-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <select name="endTime" className="input" required>
                <option value="">{t("avail.selectHour", locale)}</option>
                {HALF_HOUR_OPTIONS.map((time) => (
                  <option key={`end-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <select name="clientId" className="input">
                <option value="">{t("avail.noClient", locale)}</option>
                {clients.map((client: any) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <select name="timeZone" className="input sm:col-span-2 md:col-span-1" required>
                <option value="America/New_York">America/New_York Miami</option>
                <option value="Europe/Brussels">Europe/Brussels (Bruxelles)</option>
              </select>
              <input
                type="text"
                name="note"
                placeholder={t("avail.reservedForPlaceholder", locale)}
                className="input sm:col-span-2 md:col-span-4"
              />
              <button type="submit" className="btn btn-primary sm:col-span-2 md:col-span-4">
                {t("avail.add", locale)}
              </button>
            </form>
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              {t("avail.existingRecurring", locale)}
            </h3>
            {recurringBlocks.length === 0 ? (
              <p className="text-sm text-white/60">{t("avail.noRecurring", locale)}</p>
            ) : (
              <div className="space-y-2">
                {recurringBlocks.map((block: any) => (
                  <div
                    key={block.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {weekDays.find((d) => d.value === block.dayOfWeek)?.label} ·{" "}
                        {block.startTime} → {block.endTime} (
                        {block.timeZone === "America/New_York" ? "Miami" : "Bruxelles"})
                      </div>
                      {block.client ? (
                        <div className="mt-2 text-sm">
                          <p className="text-primary">{t("avail.clientAssigned", locale)}: {block.client.name}</p>
                          <p className="text-xs text-gray-500">{block.client.email}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-white/50">{t("avail.noClientAssigned", locale)}</p>
                      )}
                      {block.note ? (
                        <div className="text-xs text-white/60">{t("avail.note", locale)}: {block.note}</div>
                      ) : null}
                    </div>
                    <form action={deleteRecurringBlockAction}>
                      <input type="hidden" name="recurringBlockId" value={block.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        {t("avail.delete", locale)}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}


