export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/session";
import { MIAMI_TZ, BRUSSELS_TZ } from "../../../lib/time";
import { getSettings } from "../../../lib/settings";
import { saveSettingsAction } from "./actions";
import {
  createSessionModeAction,
  deleteSessionModeAction,
  createAvailabilityRuleAction,
  deleteAvailabilityRuleAction,
  createLocationPeriodAction,
  deleteLocationPeriodAction,
} from "../actions";
import { prisma } from "../../../lib/prisma";
import { GoogleCalendarConnect } from "../../../components/GoogleCalendarConnect";
import { getServerLocale, t, Locale } from "../../../lib/i18n";

export const dynamic = "force-dynamic";

const HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = i + 5; // 05:00 to 22:00
  return `${h.toString().padStart(2, "0")}:00`;
});

export default async function AdminSettingsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const locale = await getServerLocale();

  const [settings, sessionModes, googleToken, availabilityRules, locationPeriods] =
    await Promise.all([
      getSettings(),
      prisma.sessionMode.findMany({ orderBy: { startDate: "asc" } }),
      prisma.googleToken.findFirst(),
      prisma.availabilityRule.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
      prisma.locationPeriod.findMany({ orderBy: { startDate: "asc" } }),
    ]);

  const miamiRules = availabilityRules.filter((r: { location: string }) => r.location === "MIAMI");
  const brusselsRules = availabilityRules.filter((r: { location: string }) => r.location === "BELGIUM");

  const dayName = (n: number) => t(`dayName.${n}` as any, locale);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">{t("common.admin", locale)}</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          {t("settings.title", locale)}
        </h1>
        <p className="text-sm text-white/70">
          {t("settings.subtitle", locale)}
        </p>
      </div>

      {/* ── Configuration générale ─────────────────────────── */}
      <div className="card space-y-4 p-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/60">{t("settings.config", locale)}</div>
          <div className="text-lg font-semibold">{t("settings.defaultModeAndLocation", locale)}</div>
        </div>
        <form action={saveSettingsAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="location" value="MIAMI" />
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.defaultMode", locale)}</label>
            <select name="defaultMode" defaultValue={settings.defaultMode} className="input">
              <option value="VISIO">{t("settings.visio", locale)}</option>
              <option value="PRESENTIEL">{t("settings.presentiel", locale)}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.presentielLocation", locale)}</label>
            <input
              type="text"
              name="presentielLocation"
              defaultValue={settings.presentielLocation}
              className="input"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.presentielNote", locale)}</label>
            <textarea
              name="presentielNote"
              defaultValue={settings.presentielNote ?? ""}
              className="input"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary w-full md:w-auto">
              {t("settings.save", locale)}
            </button>
          </div>
        </form>
      </div>

      {/* ── Horaires Miami ─────────────────────────────────── */}
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-[#C8A060]" />
          <div>
            <div className="text-xs uppercase tracking-widest text-[#C8A060]">
              {t("settings.baseMiami", locale)} ({MIAMI_TZ})
            </div>
            <div className="text-lg font-semibold">{t("settings.hoursByDay", locale)}</div>
          </div>
        </div>

        <AvailabilityRulesBlock rules={miamiRules} location="MIAMI" locale={locale} dayName={dayName} />
      </div>

      {/* ── Horaires Belgique ─────────────────────────────── */}
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400">
              {t("settings.belgium", locale)} ({BRUSSELS_TZ})
            </div>
            <div className="text-lg font-semibold">{t("settings.hoursByDay", locale)}</div>
          </div>
        </div>

        <AvailabilityRulesBlock rules={brusselsRules} location="BELGIUM" locale={locale} dayName={dayName} />
      </div>

      {/* ── Périodes Belgique ──────────────────────────────── */}
      <div className="card space-y-4 p-6 border border-blue-500/30">
        <div>
          <div className="text-xs uppercase tracking-widest text-blue-400">
            {t("settings.belgiumStays", locale)}
          </div>
          <div className="text-lg font-semibold">
            {t("settings.whenInBelgium", locale)}
          </div>
          <p className="text-sm text-white/60 mt-1">
            {t("settings.belgiumDesc", locale)}
          </p>
        </div>

        <form action={createLocationPeriodAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.startDate", locale)}</label>
              <input
                type="date"
                name="startDate"
                required
                className="input"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.endDate", locale)}</label>
              <input
                type="date"
                name="endDate"
                required
                className="input"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.noteOptional", locale)}</label>
              <input type="text" name="note" className="input" placeholder="Ex: Vacances de Pâques" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-full md:w-auto">
            {t("settings.addPeriod", locale)}
          </button>
        </form>

        {locationPeriods.length > 0 ? (
          <div className="space-y-3">
            {locationPeriods.map((period: { id: number; startDate: Date; endDate: Date; note: string | null }) => {
              const start = new Date(period.startDate).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { timeZone: "Europe/Brussels" });
              const end = new Date(period.endDate).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { timeZone: "Europe/Brussels" });
              const now = new Date();
              const isActive =
                now >= new Date(period.startDate) && now <= new Date(period.endDate);
              return (
                <div
                  key={period.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${
                    isActive
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {start} → {end}
                      {isActive && (
                        <span className="ml-2 inline-block rounded bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">
                          {t("settings.active", locale)}
                        </span>
                      )}
                    </p>
                    {period.note && (
                      <p className="text-sm text-white/50">{period.note}</p>
                    )}
                  </div>
                  <form action={deleteLocationPeriodAction}>
                    <input type="hidden" name="id" value={period.id} />
                    <button type="submit" className="btn-danger touch-target text-sm">
                      {t("settings.delete", locale)}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/50">
            {t("settings.noPeriod", locale)}
          </p>
        )}
      </div>

      {/* ── Google Calendar ────────────────────────────────── */}
      <div className="card space-y-4 p-6">
        <div className="text-xs uppercase tracking-widest text-white/60">{t("settings.googleCalendar", locale)}</div>
        <div className="text-lg font-semibold">{t("settings.connectionAndSync", locale)}</div>
        <GoogleCalendarConnect
          isConnected={Boolean(googleToken)}
          googleEmail={googleToken?.googleEmail ?? null}
        />
      </div>

      {/* ── Modes de session ───────────────────────────────── */}
      <div className="card space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-semibold">{t("settings.sessionModes", locale)}</h2>
          <p className="text-sm text-white/70">
            {t("settings.sessionModesDesc", locale)}
          </p>
        </div>

        <form action={createSessionModeAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.startDate", locale)}</label>
              <input
                type="date"
                name="startDate"
                required
                className="input"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.endDate", locale)}</label>
              <input
                type="date"
                name="endDate"
                required
                className="input"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">{t("settings.selectMode", locale)}</label>
            <select name="mode" required className="input">
              <option value="">{t("settings.selectMode", locale)}</option>
              <option value="VISIO">{t("settings.onlineVisio", locale)}</option>
              <option value="PRESENTIEL">{t("settings.onSite", locale)}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">
              {t("settings.addressIfPresentiel", locale)}
            </label>
            <input
              type="text"
              name="location"
              className="input"
              placeholder="Ex: 123 Rue Example, Bruxelles"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full md:w-auto">
            {t("settings.addRange", locale)}
          </button>
        </form>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold">{t("settings.configuredRanges", locale)}</h3>
          {sessionModes.length > 0 ? (
            <div className="space-y-3">
              {sessionModes.map((sessionMode: { id: number; startDate: Date; endDate: Date; mode: string; location: string | null }) => (
                <div key={sessionMode.id} className="card space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold">
                        {t("settings.from", locale)} {new Date(sessionMode.startDate).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { timeZone: "Europe/Brussels" })} {t("settings.to", locale)}{" "}
                        {new Date(sessionMode.endDate).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { timeZone: "Europe/Brussels" })}
                      </p>
                      <p className="text-sm text-white/70">
                        Mode :{" "}
                        {sessionMode.mode === "VISIO"
                          ? t("settings.onlineVisio", locale)
                          : t("settings.onSite", locale)}
                      </p>
                      {sessionMode.location ? (
                        <p className="text-sm text-white/50">{sessionMode.location}</p>
                      ) : null}
                    </div>
                    <form action={deleteSessionModeAction}>
                      <input type="hidden" name="id" value={sessionMode.id} />
                      <button type="submit" className="btn-danger touch-target text-sm">
                        {t("settings.delete", locale)}
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">
              {t("settings.noRange", locale)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Sous-composant: bloc de règles d'horaires ────────────────

type RuleRow = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
};

function AvailabilityRulesBlock({
  rules,
  location,
  locale,
  dayName,
}: {
  rules: RuleRow[];
  location: "MIAMI" | "BELGIUM";
  locale: Locale;
  dayName: (n: number) => string;
}) {
  const grouped = new Map<number, RuleRow[]>();
  for (const rule of rules) {
    const existing = grouped.get(rule.dayOfWeek) ?? [];
    existing.push(rule);
    grouped.set(rule.dayOfWeek, existing);
  }

  return (
    <div className="space-y-4">
      {/* Existing rules */}
      {rules.length > 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const dayRules = grouped.get(day);
            if (!dayRules || dayRules.length === 0) return null;
            return (
              <div key={day} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-sm font-medium text-white/80">
                  {dayName(day)}
                </span>
                {dayRules.map((rule) => (
                  <form
                    key={rule.id}
                    action={deleteAvailabilityRuleAction}
                    className="inline-flex"
                  >
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <button
                      type="submit"
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                        location === "MIAMI"
                          ? "bg-[#C8A060]/20 text-[#C8A060] hover:bg-red-500/30 hover:text-red-300"
                          : "bg-blue-500/20 text-blue-300 hover:bg-red-500/30 hover:text-red-300"
                      } transition-colors`}
                      title="Cliquer pour supprimer"
                    >
                      {rule.startTime} – {rule.endTime}
                      <span className="text-xs opacity-60">✕</span>
                    </button>
                  </form>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-white/40">
          {t("settings.noHours", locale)}{" "}
          {location === "MIAMI"
            ? t("settings.miamiDefault", locale)
            : t("settings.belgiumDefault", locale)}
        </p>
      )}

      {/* Add new rule form */}
      <form action={createAvailabilityRuleAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="location" value={location} />
        <div className="space-y-1">
          <label className="text-xs text-white/50">{t("settings.day", locale)}</label>
          <select name="dayOfWeek" className="input py-2 text-sm" required>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">{t("settings.start", locale)}</label>
          <select name="startTime" className="input py-2 text-sm" required>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">{t("settings.end", locale)}</label>
          <select name="endTime" className="input py-2 text-sm" required defaultValue="18:00">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            location === "MIAMI"
              ? "bg-[#C8A060] text-black hover:bg-[#B8904F]"
              : "bg-blue-600 hover:bg-blue-700"
          } transition-colors`}
        >
          {t("settings.addBtn", locale)}
        </button>
      </form>
    </div>
  );
}
