/**
 * Durées de conservation du journal technique SyncLog. Logique pure, testée
 * par tests/retention.test.mjs ; la purge est faite par /api/cron/maintenance.
 *
 * Sans purge, SyncLog occupait 167 Mo sur 186 Mo de base au 10/11/2026
 * (limite du plan gratuit Supabase : 500 Mo). Les rendez-vous, clients et
 * autres données métier ne sont jamais concernés.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Événements système : dates de sauvegarde et d'alerte, lus par la maintenance. */
export const SYSTEM_ACTIONS = [
  "backup_sent",
  "backup_failed",
  "alert_sync_down",
  "alert_sync_recovered",
  "alert_storage",
];

/** Incidents : gardés plus longtemps pour les enquêtes après coup. */
export const INCIDENT_ACTIONS = [
  "auth_error",
  "sync_error",
  "token_failover",
  "error",
  "reconcile_delete",
  "reconcile_aborted",
];

export const RETENTION_DAYS = { routine: 30, incident: 90, system: 365 };

/**
 * Bornes de purge : tout ce qui est plus ancien que la date indiquée est supprimé.
 * @param {number} now horodatage en millisecondes
 */
export function syncLogPurgePlan(now) {
  return {
    routineBefore: new Date(now - RETENTION_DAYS.routine * DAY_MS),
    incidentBefore: new Date(now - RETENTION_DAYS.incident * DAY_MS),
    systemBefore: new Date(now - RETENTION_DAYS.system * DAY_MS),
    keptLonger: [...SYSTEM_ACTIONS, ...INCIDENT_ACTIONS],
    incidentActions: [...INCIDENT_ACTIONS],
  };
}
