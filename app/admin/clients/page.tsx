export const runtime = "nodejs";

import { redirect } from "next/navigation";
import {
  addClientAction,
  toggleClientAction,
  updateCreditsAction
} from "../actions";
import { clientUsageThisMonth, listClients } from "../../../lib/admin";
import { getAdminSession } from "../../../lib/session";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string };

export default async function AdminClientsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : undefined;

  const [clients, usageMap] = await Promise.all([listClients(), clientUsageThisMonth()]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">Clients</h1>
        <p className="text-sm text-white/70">Gestion des comptes, quotas mensuels et statut actif.</p>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-4 p-6">
          <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
            Ajouter un client
          </h2>
          <form action={addClientAction} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input type="text" name="name" placeholder="Nom" required className="input" />
              <input type="email" name="email" placeholder="Email" required className="input" />
              <input
                type="number"
                min={1}
                name="creditsPerMonth"
                placeholder="Crédits/mois"
                required
                className="input"
              />
              <input
                type="text"
                name="password"
                placeholder="Mot de passe"
                required
                className="input"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              Ajouter
            </button>
          </form>
          <p className="text-xs text-white/60">
            Les identifiants sont transmis manuellement. Les clients inactifs ne peuvent pas se connecter.
          </p>
        </div>

        <div className="card space-y-4 p-6">
          <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
            Liste des clients
          </h2>
          <div className="space-y-3">
            {clients.map((client) => {
              const used = usageMap.get(client.id) ?? 0;
              return (
                <div
                  key={client.id}
                  className="rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{client.name}</div>
                      <div className="text-white/60">{client.email}</div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] ${
                        client.isActive ? "bg-emerald-100 text-emerald-800" : "bg-background-elevated/10 text-white/60"
                      }`}
                    >
                      {client.isActive ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <div className="mt-2 text-white/70">
                    {used}/{client.creditsPerMonth} crédits utilisés ce mois-ci
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <form action={updateCreditsAction} className="flex items-center gap-2 text-xs">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input
                        type="number"
                        name="creditsPerMonth"
                        min={1}
                        defaultValue={client.creditsPerMonth}
                        className="w-full rounded-md border border-border px-2 py-2"
                      />
                      <button className="rounded-md border border-border px-3 py-2 hover:bg-black hover:text-white">
                        Mettre à jour
                      </button>
                    </form>
                    <form action={toggleClientAction} className="flex items-center justify-end">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="active" value={(!client.isActive).toString()} />
                      <button className="rounded-md border border-border px-3 py-2 text-xs hover:bg-black hover:text-white">
                        {client.isActive ? "Désactiver" : "Activer"}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

