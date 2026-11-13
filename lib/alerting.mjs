/**
 * Décisions d'alerte : logique pure (sans Prisma), testée par
 * tests/alerting.test.mjs. Les envois sont faits par lib/admin-alerts.ts.
 */

/** Sync considérée en panne après 30 min sans sync_ok (cron toutes les 5 min). */
export const SYNC_DOWN_THRESHOLD_MS = 30 * 60 * 1000;
/** Tant que la panne dure, rappel au plus toutes les 12 h. */
export const ALERT_REPEAT_MS = 12 * 60 * 60 * 1000;
/**
 * Seuil d'alerte stockage, en Mo, réglable par DB_SIZE_ALERT_MB. Par défaut
 * 400 Mo : la base est sur le plan gratuit Supabase (limite 500 Mo). Après
 * passage au plan Pro (8 Go inclus), mettre DB_SIZE_ALERT_MB=6144.
 */
const configuredAlertMb = Number(process.env.DB_SIZE_ALERT_MB);
export const DB_SIZE_ALERT_BYTES =
  (Number.isFinite(configuredAlertMb) && configuredAlertMb > 0 ? configuredAlertMb : 400) * 1024 ** 2;
/** Une sauvegarde hors Supabase au moins tous les 7 jours. */
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {{ now: number, lastOkAt: number | null, lastAlertAt: number | null, lastRecoveryAt: number | null }} s
 * @returns {"down" | "recovered" | null}
 */
export function decideSyncAlert({ now, lastOkAt, lastAlertAt, lastRecoveryAt }) {
  const alertOpen = lastAlertAt !== null && (lastRecoveryAt === null || lastRecoveryAt < lastAlertAt);
  const isDown = lastOkAt === null || now - lastOkAt > SYNC_DOWN_THRESHOLD_MS;

  if (alertOpen && lastOkAt !== null && lastOkAt > lastAlertAt) return "recovered";
  if (!isDown) return null;
  if (!alertOpen) return "down";
  return now - lastAlertAt >= ALERT_REPEAT_MS ? "down" : null;
}

/**
 * @param {{ now: number, lastBackupAt: number | null }} s
 */
export function isBackupDue({ now, lastBackupAt }) {
  return lastBackupAt === null || now - lastBackupAt >= BACKUP_INTERVAL_MS;
}

/**
 * @param {{ now: number, sizeBytes: number, lastStorageAlertAt: number | null }} s
 */
export function shouldAlertStorage({ now, sizeBytes, lastStorageAlertAt }) {
  if (sizeBytes < DB_SIZE_ALERT_BYTES) return false;
  return lastStorageAlertAt === null || now - lastStorageAlertAt >= BACKUP_INTERVAL_MS;
}
