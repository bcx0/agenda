export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
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
  listClients,
  listRecurringBlocks
} from "../../../lib/admin";
import { BRUSSELS_TZ, MIAMI_TZ, formatInZone } from "../../../lib/time";
import { getAdminSession } from "../../../lib/session";
import { getAvailability } from "../../../lib/booking";
import AdminGeneralAvailability from "./AdminGeneralAvailability";

export const dynamic = "force-dynamic";

type PageSearchParams = {
  error?: string | string[];
  success?: string | string[];
  tab?: string | string[];
};

const WEEK_DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" }
];

function tabLink(tab: string, label: string, active: boolean) {
  const base =
    "rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition";
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

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : undefined;
  const rawSuccess = Array.isArray(searchParams?.success)
    ? searchParams?.success[0]
    : searchParams?.success;
  const successMessage = rawSuccess ? decodeURIComponent(rawSuccess) : undefined;
  const tab = searchParams?.tab ?? "weekly";

  const [rules, overrides, recurringBlocks, legacyBlocks, clients, slots] = await Promise.all([
    listAvailabilityRules(),
    listAvailabilityOverrides(),
    listRecurringBlocks(),
    listBlocks(),
    listClients(),
    getAvailability()
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Disponibilités
        </h1>
        <p className="text-sm text-white/70">
          Configuration en timezone Brussels, avec affichage double (Brussels / Miami) pour vérification.
        </p>
      </div>

      {errorMessage ? <div className="alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="alert-success">{successMessage}</div> : null}

      <div className="flex flex-wrap gap-2">
        {tabLink("general", "Disponibilités générales", tab === "general")}
        {tabLink("weekly", "Règles hebdo", tab === "weekly")}
        {tabLink("overrides", "Exceptions", tab === "overrides")}
        {tabLink("recurring", "Blocs récurrents", tab === "recurring")}
      </div>

      {tab === "general" ? (
        <AdminGeneralAvailability
          slots={slots}
          rules={rules}
          overrides={overrides
            .filter((o) => o.type === "OPEN")
            .map((o) => ({
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
              Ajouter une règle hebdo
            </h2>
            <form action={createAvailabilityRuleAction} className="grid gap-3 md:grid-cols-3">
              <select name="dayOfWeek" className="input" required>
                {WEEK_DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <input type="time" name="startTime" className="input" required />
              <input type="time" name="endTime" className="input" required />
              <button type="submit" className="btn btn-primary md:col-span-3">
                Ajouter
              </button>
            </form>
            {rules.length === 0 ? (
              <p className="text-xs text-white/60">
                Aucune règle définie. Les créneaux retombent sur la plage par défaut tant que
                vous n’en créez pas.
              </p>
            ) : null}
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Règles existantes
            </h3>
            {rules.length === 0 ? (
              <p className="text-sm text-white/60">Aucune règle.</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {WEEK_DAYS.find((d) => d.value === rule.dayOfWeek)?.label} ·{" "}
                        {rule.startTime} → {rule.endTime} (Brussels)
                      </div>
                    </div>
                    <form action={deleteAvailabilityRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        Supprimer
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "overrides" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Exception ponctuelle
            </h2>
            <form action={createAvailabilityOverrideAction} className="grid gap-3 md:grid-cols-5">
              <input type="date" name="date" className="input" required />
              <input type="time" name="startTime" className="input" required />
              <input type="time" name="endTime" className="input" required />
              <select name="type" className="input" required>
                <option value="BLOCK">Bloquer</option>
                <option value="OPEN">Ouvrir</option>
              </select>
              <input
                type="text"
                name="note"
                placeholder="Note (optionnel)"
                className="input md:col-span-5"
              />
              <button type="submit" className="btn btn-primary md:col-span-5">
                Ajouter
              </button>
            </form>
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Exceptions existantes
            </h3>
            {overrides.length === 0 ? (
              <p className="text-sm text-white/60">Aucune exception.</p>
            ) : (
              <div className="space-y-2">
                {overrides.map((override) => (
                  <div
                    key={override.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {formatInZone(override.date, "dd LLL yyyy", BRUSSELS_TZ)} ·{" "}
                        {override.startTime} → {override.endTime} (Brussels)
                      </div>
                      <div className="text-white/60">
                        {override.type === "OPEN" ? "Ouverture" : "Blocage"} ·{" "}
                        {formatInZone(override.date, "dd LLL yyyy", MIAMI_TZ)} (Miami)
                      </div>
                      {override.note ? (
                        <div className="text-xs text-white/60">Note: {override.note}</div>
                      ) : null}
                    </div>
                    <form action={deleteAvailabilityOverrideAction}>
                      <input type="hidden" name="overrideId" value={override.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        Supprimer
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
                Blocages hérités
              </h3>
              <div className="space-y-2">
                {legacyBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {formatInZone(block.startAt, "dd LLL yyyy HH:mm", BRUSSELS_TZ)} →{" "}
                        {formatInZone(block.endAt, "HH:mm", BRUSSELS_TZ)} (Brussels)
                      </div>
                      <div className="text-white/60">
                        {formatInZone(block.startAt, "HH:mm", MIAMI_TZ)} →{" "}
                        {formatInZone(block.endAt, "HH:mm", MIAMI_TZ)} (Miami)
                      </div>
                      {block.reason ? (
                        <div className="text-xs text-white/60">Raison: {block.reason}</div>
                      ) : null}
                    </div>
                    <form action={deleteBlockAction}>
                      <input type="hidden" name="blockId" value={block.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        Supprimer
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
              Ajouter un bloc récurrent
            </h2>
            <form action={createRecurringBlockAction} className="grid gap-3 md:grid-cols-4">
              <select name="dayOfWeek" className="input" required>
                {WEEK_DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
              <input type="time" name="startTime" className="input" required />
              <input type="time" name="endTime" className="input" required />
              <select name="clientId" className="input">
                <option value="">Aucun client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                name="note"
                placeholder="Réservé pour… (optionnel)"
                className="input md:col-span-4"
              />
              <button type="submit" className="btn btn-primary md:col-span-4">
                Ajouter
              </button>
            </form>
          </div>

          <div className="card space-y-3 p-6">
            <h3 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Blocs récurrents existants
            </h3>
            {recurringBlocks.length === 0 ? (
              <p className="text-sm text-white/60">Aucun bloc récurrent.</p>
            ) : (
              <div className="space-y-2">
                {recurringBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {WEEK_DAYS.find((d) => d.value === block.dayOfWeek)?.label} ·{" "}
                        {block.startTime} → {block.endTime} (Brussels)
                      </div>
                      <div className="text-white/60">
                        {block.client ? `Réservé pour ${block.client.name}` : "Réservé"}
                      </div>
                      {block.note ? (
                        <div className="text-xs text-white/60">Note: {block.note}</div>
                      ) : null}
                    </div>
                    <form action={deleteRecurringBlockAction}>
                      <input type="hidden" name="recurringBlockId" value={block.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700">
                        Supprimer
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

