export const runtime = "nodejs";

import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/session";
import { listProspects, type ProspectStatus } from "../../../lib/prospects";
import {
  AddProspectForm,
  ProspectActions,
  STATUS_LABELS,
} from "./ProspectForms";
import {
  createProspectAction,
  deleteProspectAction,
  updateProspectStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

const BRUSSELS_TZ = "Europe/Brussels";

type SearchParams = { error?: string | string[]; success?: string | string[] };

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

function fmt(date: Date | null) {
  if (!date) return null;
  return DateTime.fromJSDate(date).setZone(BRUSSELS_TZ).setLocale("fr").toFormat("dd LLL yyyy · HH:mm");
}

const STATUS_STYLES: Record<ProspectStatus, string> = {
  NEW: "bg-[#C8A060]/20 text-[#C8A060]",
  CONTACTED: "bg-blue-500/20 text-blue-300",
  CONVERTED: "bg-green-500/20 text-green-300",
  ARCHIVED: "bg-white/10 text-white/50",
};

export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const prospects = await listProspects();

  const error = first(searchParams?.error);
  const success = first(searchParams?.success);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-[var(--font-playfair)] text-2xl uppercase tracking-wider">Prospects</h1>
        <p className="text-sm text-white/60">
          Demandes de rencontre de personnes sans compte client ni contrat. Aucun crédit, aucun
          mot de passe — juste une fiche à recontacter.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {decodeURIComponent(error)}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-green-400/40 bg-green-500/10 px-4 py-2 text-sm text-green-200">
          {decodeURIComponent(success)}
        </div>
      ) : null}

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/60">
          Nouveau prospect
        </h2>
        <AddProspectForm action={createProspectAction} />
      </section>

      <section className="space-y-3">
        {prospects.length === 0 ? (
          <p className="rounded-md border border-border px-4 py-6 text-center text-sm text-white/50">
            Aucun prospect pour le moment.
          </p>
        ) : (
          prospects.map((p) => {
            const status = (p.status as ProspectStatus) ?? "NEW";
            const desired = fmt(p.desiredAt);
            return (
              <article key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          STATUS_STYLES[status] ?? STATUS_STYLES.NEW
                        }`}
                      >
                        {STATUS_LABELS[status] ?? p.status}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-xs text-white/60">
                      {p.email ? <div>{p.email}</div> : null}
                      {p.phone ? <div>{p.phone}</div> : null}
                      {desired ? <div>Souhaité : {desired}</div> : null}
                      {p.note ? <div className="text-white/50">« {p.note} »</div> : null}
                    </div>
                  </div>
                </div>
                <ProspectActions
                  id={p.id}
                  status={status}
                  updateStatusAction={updateProspectStatusAction}
                  deleteAction={deleteProspectAction}
                />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
