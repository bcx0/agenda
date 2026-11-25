/**
 * Garde-fous de la synchronisation bidirectionnelle Google ↔ app (25/11/2026).
 * Fonctions pures, partagées par le moteur de synchro, les routes (cron,
 * webhook) et les tests.
 */

/** Au moins un événement du lot a échoué ? */
export function hasProcessingErrors(results) {
  return (results ?? []).some((r) => typeof r?.action === "string" && r.action.startsWith("error"));
}

/**
 * Le jeton de synchro Google ne doit avancer que si TOUS les événements du
 * lot ont été traités. Avant, il avançait même en cas d'erreur : les
 * changements en échec (déplacement, suppression) n'étaient jamais rejoués et
 * la synchro était journalisée « sync_ok » alors qu'elle était partielle.
 * Rejouer un lot est sans risque : le traitement est idempotent (etag).
 */
export function shouldAdvanceSyncToken(results) {
  return !hasProcessingErrors(results);
}

/**
 * Une modification locale non encore confirmée par Google (syncStatus
 * "pending" ou "error") et PLUS RÉCENTE que la version Google ne doit pas être
 * écrasée par cette ancienne version (ex. : RDV déplacé dans l'app pendant que
 * Google renvoie l'événement non encore mis à jour). Elle sera repoussée vers
 * Google par retryPendingUpdates. Si la version Google est plus récente, elle
 * l'emporte (dernier écrivain).
 *
 * @param {{ syncStatus?: string | null, updatedAt?: Date | string | null } | null} record
 * @param {{ updated?: string | null } | null} googleEvent
 */
export function localChangeWins(record, googleEvent) {
  if (!record || !googleEvent) return false;
  if (record.syncStatus !== "pending" && record.syncStatus !== "error") return false;
  const localUpdated = record.updatedAt ? new Date(record.updatedAt).getTime() : NaN;
  const googleUpdated = Date.parse(googleEvent.updated ?? "");
  if (!Number.isFinite(googleUpdated)) return true;
  if (!Number.isFinite(localUpdated)) return false;
  return localUpdated > googleUpdated;
}
