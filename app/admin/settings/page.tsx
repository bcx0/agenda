export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/session";
import { MIAMI_TZ, BRUSSELS_TZ } from "../../../lib/time";
import { getSettings } from "../../../lib/settings";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const settings = await getSettings();

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="pill w-fit">Admin</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Paramètres
        </h1>
        <p className="text-sm text-white/70">Référence des paramètres de prise de rendez-vous.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 p-5">
          <div className="text-xs uppercase tracking-widest text-white/60">Timezones</div>
          <div className="text-lg font-semibold">Brussels: {BRUSSELS_TZ}</div>
          <div className="text-lg font-semibold">Miami: {MIAMI_TZ}</div>
          <p className="text-sm text-white/60">
            Les créneaux sont définis via les règles hebdo + exceptions, puis affichés en double timezone.
          </p>
        </div>
        <div className="card space-y-2 p-5">
          <div className="text-xs uppercase tracking-widest text-white/60">Horaires</div>
          <div className="text-lg font-semibold">
            Les horaires s’appuient sur les règles hebdo et exceptions configurées.
          </div>
          <p className="text-sm text-white/60">
            Les exceptions et blocs récurrents se configurent dans l’onglet Disponibilités.
          </p>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">Configuration</div>
            <div className="text-lg font-semibold">Localisation et mode par défaut</div>
          </div>
        </div>
        <form action={saveSettingsAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">Localisation Geoffrey</label>
            <select name="location" defaultValue={settings.location} className="input">
              <option value="MIAMI">Miami</option>
              <option value="BELGIUM">Belgique</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">Mode par défaut</label>
            <select name="defaultMode" defaultValue={settings.defaultMode} className="input">
              <option value="VISIO">Visio</option>
              <option value="PRESENTIEL">Présentiel</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">Lieu présentiel</label>
            <input
              type="text"
              name="presentielLocation"
              defaultValue={settings.presentielLocation}
              className="input"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs uppercase tracking-widest text-white/60">Note présentiel</label>
            <textarea
              name="presentielNote"
              defaultValue={settings.presentielNote ?? ""}
              className="input"
              rows={3}
            />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}


