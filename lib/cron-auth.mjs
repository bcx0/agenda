/**
 * Authentification des tâches planifiées (crons Vercel). Logique pure,
 * testée par tests/cron-auth.test.mjs.
 *
 * Fermé par défaut : si CRON_SECRET n'est pas défini, AUCUNE requête n'est
 * acceptée. L'ancienne comparaison avec `Bearer ${process.env.CRON_SECRET}`
 * acceptait l'en-tête « Bearer undefined » quand la variable manquait.
 * Comparaison en temps constant pour ne rien révéler du secret.
 */
import { timingSafeEqual } from "node:crypto";

/**
 * @param {string | null | undefined} authHeader valeur de l'en-tête Authorization
 * @param {string | null | undefined} secret valeur de CRON_SECRET
 * @returns {boolean}
 */
export function isCronRequestAuthorized(authHeader, secret) {
  if (typeof secret !== "string" || secret.trim() === "") return false;
  if (typeof authHeader !== "string" || authHeader === "") return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const given = Buffer.from(authHeader, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
