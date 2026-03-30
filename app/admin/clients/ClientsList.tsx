"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addClientAction,
  deleteClientAction,
  toggleClientAction,
  updateClientEmailAction,
  updateCreditsAction
} from "../actions";
import { useLanguage } from "../../../components/LanguageProvider";

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
  const [deleteConfirm, setDeleteConfirm] = useState<ClientItem | null>(null);
  const { t } = useLanguage();

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
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">{t("clients.title")}</h1>
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
            {t("clients.addClient")}
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
                placeholder="RDV/mois"
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
              {t("clients.clientList")}
            </h2>
            <input
              type="text"
              placeholder={t("clients.search")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="input p-4 text-base"
            />
          </div>

          <div className="space-y-3 md:hidden">
            {filteredClients.length === 0 ? (
              <div className="card p-6 text-sm text-white/60">{t("clients.noClient")}</div>
            ) : (
              filteredClients.map((client) => (
                <article key={client.id} className="card p-5 relative">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(client)}
                    className="absolute top-3 right-3 p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/25 hover:text-red-400 transition-colors"
                    title="Supprimer ce client"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="flex items-start justify-between pr-8">
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
                      {client.isActive ? t("clients.active") : t("clients.inactive")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#C8A060]">
                    {client.usedThisMonth}/{client.creditsPerMonth} RDV
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <form action={toggleClientAction}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="active" value={(!client.isActive).toString()} />
                      <button className="btn-secondary touch-target w-full text-sm">
                        {client.isActive ? t("clients.deactivate") : t("clients.activate")}
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
              <div className="card-gm p-6 text-sm text-white/60">{t("clients.noClient")}</div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="card-gm relative rounded-lg border border-border bg-background-elevated px-4 py-4 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(client)}
                    className="absolute top-3 right-3 p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/25 hover:text-red-400 transition-colors"
                    title="Supprimer ce client"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="flex items-start justify-between gap-3 pr-8">
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
                      {client.isActive ? t("clients.active") : t("clients.inactive")}
                    </span>
                  </div>

                  <div className="mt-2 text-white/70">
                    {client.usedThisMonth}/{client.creditsPerMonth} RDV utilisés ce mois-ci
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
                        {client.isActive ? t("clients.deactivate") : t("clients.activate")}
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

      {/* Modale de confirmation de suppression */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background-elevated p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">{t("clients.deleteConfirm")}</h3>
            <p className="mt-2 text-sm text-white/70">
              <span className="font-semibold text-white">{deleteConfirm.name}</span> — {t("clients.deleteWarning")}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <form
                action={deleteClientAction}
                className="flex-1"
                onSubmit={() => setDeleteConfirm(null)}
              >
                <input type="hidden" name="clientId" value={deleteConfirm.id} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  {t("clients.delete")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
