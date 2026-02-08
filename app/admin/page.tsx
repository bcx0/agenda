export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../lib/session";
import { adminLoginAction, adminLogoutAction } from "./actions";
import { countCancelledBookings, listClients, listUpcomingBookingsThisMonth } from "../../lib/admin";
import { formatInZone, BRUSSELS_TZ } from "../../lib/time";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string };

export default async function AdminPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = getAdminSession();
  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const errorMessage = rawError ? decodeURIComponent(rawError) : undefined;

  if (!session) {
    return (
      <section className="mx-auto max-w-xl space-y-6">
        <div className="space-y-3">
          <p className="pill w-fit">Espace Admin</p>
          <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
            Connexion requise
          </h1>
          <p className="text-sm text-white/70">
            Protégé par mot de passe (.env ADMIN_PASSWORD). Aucune notification n'est envoyée automatiquement.
          </p>
        </div>
        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        ) : null}
        <form action={adminLoginAction} className="card space-y-4 p-6">
          <label className="text-xs uppercase tracking-widest text-white/60">
            Mot de passe admin
          </label>
          <input
            type="password"
            name="password"
            className="w-full rounded-md border border-border bg-background-elevated px-3 py-3 text-sm focus:border-border focus:outline-none"
            placeholder="Mot de passe"
            required
          />
          <button type="submit" className="btn btn-primary w-full">
            Se connecter
          </button>
        </form>
      </section>
    );
  }

  const [clients, bookings, cancelledCount] = await Promise.all([
    listClients(),
    listUpcomingBookingsThisMonth(),
    countCancelledBookings()
  ]);
  const upcoming = bookings.slice(0, 4);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="pill w-fit">Dashboard</p>
          <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
            Administration
          </h1>
          <p className="text-sm text-white/70">Vue rapide des clients et rendez-vous.</p>
        </div>
        <form action={adminLogoutAction}>
          <button className="text-sm underline underline-offset-4 hover:text-white">Se déconnecter</button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Clients actifs" value={clients.filter((c) => c.isActive).length} />
        <StatCard label="Rendez-vous" value={bookings.length} />
        <StatCard label="Annulés" value={cancelledCount} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">Rendez-vous récents</h2>
            <Link href="/admin/bookings" className="text-sm underline underline-offset-4">
              Voir tout
            </Link>
          </div>
          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-white/60">Aucun rendez-vous.</p>
            ) : (
              upcoming.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-border bg-background-elevated px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{b.client.name}</div>
                    <span className="rounded-full bg-background-elevated/5 px-2 py-1 text-[11px] text-white/60">
                      {b.status}
                    </span>
                  </div>
                  <div className="text-white/70">
                    {formatInZone(b.startAt, "dd LLL yyyy HH:mm", BRUSSELS_TZ)} (Brussels)
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-[var(--font-playfair)] text-xl uppercase tracking-wider">Actions rapides</h2>
          </div>
          <div className="grid gap-2 text-sm">
            <Link className="rounded-md border border-border bg-background-elevated px-3 py-2 hover:border-border" href="/admin/availability">
              Gérer les disponibilités
            </Link>
            <Link className="rounded-md border border-border bg-background-elevated px-3 py-2 hover:border-border" href="/admin/clients">
              Gérer les clients
            </Link>
            <Link className="rounded-md border border-border bg-background-elevated px-3 py-2 hover:border-border" href="/admin/bookings">
              Gérer les rendez-vous
            </Link>
            <Link className="rounded-md border border-border bg-background-elevated px-3 py-2 hover:border-border" href="/admin/settings">
              Paramètres
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card space-y-1 p-4">
      <div className="text-xs uppercase tracking-widest text-white/60">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

