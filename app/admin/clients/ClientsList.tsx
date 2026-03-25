"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addClientAction,
  toggleClientAction,
  updateClientEmailAction,
  updateCreditsAction
} from "../actions";

type ClientItem = {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  creditsPerMonth: number;
  usedThisMonth: number;
};

type Props = {
  initialClients: ClientItem[];
  errorMessage?: string;
  successMessage?: string;
  addFormDefaults?: {
    name?: string;
    email?: string;
    creditsPerMonth?: string;
  };
};

export default function ClientsList({
  initialClients,
  errorMessage,
  successMessage,
  addFormDefaults
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return initialClients;
    const query = searchQuery.trim().toLowerCase();
    return initialClients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) || client.email.toLowerCase().includes(query)
    );
  }, [initialClients, searchQuery]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">Clients</h1>
        <p className="text-sm text-white/70">
          Gestion des comptes, quotas mensuels, recherche et historique des rendez-vous.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? <div className="alert-success">{successMessage}</div> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card-gm space-y-4 p-4 md:p-6">
          <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
            Ajouter un client
          </h2>
          <form action={addClientAction} className="space-y-3">
            <div className="grid gap-3">
              <input
                type="text"
                name="name"
                placeholder="Nom"
                required
                className="input p-4 text-base"
                defaultValue={addFormDefaults?.name ?? ""}
              />
              <input
                type="email"
                name="email"
                inputMode="email"
                placeholder="Email"
                required
                className="input p-4 text-base"
                defaultValue={addFormDefaults?.email ?? ""}
              />
              <input
                type="number"
                min={1}
                name="creditsPerMonth"
                inputMode="numeric"
                placeholder="Crédits/mois"
                required
                className="input p-4 text-base"
                defaultValue={addFormDefaults?.creditsPerMonth ?? ""}
              />
              <input
                type="text"
                name="password"
                placeholder="Mot de passe"
                required
                className="input p-4 text-base"
              />
            </div>
            <div className="sticky bottom-16 md:static">
              <button type="submit" className="btn btn-primary touch-target w-full">
                Ajouter
              </button>
            </div>
          </form>
          <p className="text-xs text-white/60">
            Les identifiants sont transmis manuellement. Les clients inactifs ne peuvent pas se
            connecter.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card-gm space-y-3 p-4 md:p-6">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">
              Liste des clients
            </h2>
            <input
              type="text"
              placeholder="Rechercher un client par nom ou email..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="input p-4 text-base"
            />
          </div>

          <div className="space-y-3 md:hidden">
            {filteredClients.length === 0 ? (
              <div className="card p-6 text-sm text-white/60">Aucun client trouvé.</div>
            ) : (
              filteredClients.map((client) => (
                <article key={client.id} className="card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold">{client.name}</h3>
                      <p className="mt-0.5 text-sm text-white/50">{client.email}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        client.isActive
                          ? "bg-green-900/30 text-green-400 border border-green-800"
                          : "bg-white/5 text-white/50 border border-gray-800"
                      }`}
                    >
                      {client.isActive ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#C8A060]">
                    {client.usedThisMonth}/{client.creditsPerMonth} crédits
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <form action={toggleClientAction}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="active" value={(!client.isActive).toString()} />
                      <button className="btn-secondary touch-target w-full text-sm">
                        {client.isActive ? "Désactiver" : "Activer"}
                      </button>
                    </form>
                    <Link
                      href={`/admin/clients/${client.id}/bookings`}
                      className="btn-primary touch-target block w-full text-center text-sm"
                    >
                      Voir RDV
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden space-y-3 md:block">
            {filteredClients.length === 0 ? (
              <div className="card-gm p-6 text-sm text-white/60">Aucun client trouvé.</div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="card-gm rounded-lg border border-border bg-background-elevated px-4 py-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{client.name}</div>
                      <div className="text-xs text-white/50">ID: {client.id}</div>
                      <div className="text-sm text-white/60">{client.email}</div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] ${
                        client.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-background-elevated/10 text-white/60"
                      }`}
                    >
                      {client.isActive ? "Actif" : "Inactif"}
                    </span>
                  </div>

                  <div className="mt-2 text-white/70">
                    {client.usedThisMonth}/{client.creditsPerMonth} crédits utilisés ce mois-ci
                  </div>

                  <div className="mt-2">
                    <Link
                      href={`/admin/clients/${client.id}/bookings`}
                      className="text-sm text-primary transition-colors hover:text-primary-light"
                    >
                      Voir les RDV →
                    </Link>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <form action={updateCreditsAction} className="flex items-center gap-2 text-xs">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input
                        type="number"
                        name="creditsPerMonth"
                        min={1}
                        inputMode="numeric"
                        defaultValue={client.creditsPerMonth}
                        className="input"
                      />
                      <button className="btn-secondary touch-target text-sm">
                        Mettre à jour
                      </button>
                    </form>
                    <form action={toggleClientAction} className="flex items-center justify-end">
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="active" value={(!client.isActive).toString()} />
                      <button className="touch-target rounded-md border border-border px-3 py-2 text-xs hover:bg-black hover:text-white">
                        {client.isActive ? "Désactiver" : "Activer"}
                      </button>
                    </form>
                  </div>

                  <form
                    action={updateClientEmailAction}
                    className="mt-2 flex items-center gap-2 text-xs"
                  >
                    <input type="hidden" name="clientId" value={client.id} />
                    <input
                      type="email"
                      name="email"
                      inputMode="email"
                      required
                      defaultValue={client.email}
                      className="input"
                    />
                    <button className="btn-secondary touch-target text-sm">
                      Mettre à jour email
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
