/**
 * Relais Apps Script : logique pure (sans Prisma), testable en node seul
 * (tests/google-proxy.test.mjs). Utilisée par lib/google-calendar.ts.
 *
 * Le script (scripts/google-apps-script/Code.gs) reçoit
 * { secret, method, url, body } et répond { status, body } : status/body sont
 * ceux de l'API Google Calendar elle-même.
 */

export const CALENDAR_API_PREFIX = "https://www.googleapis.com/calendar/v3/";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * @typedef {Object} ProxyResult
 * @property {number} status
 * @property {string} body
 */

/**
 * @param {unknown} value
 * @returns {value is ProxyResult}
 */
export function isProxyResult(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    typeof candidate.body === "string"
  );
}

/**
 * Exécute une requête Calendar via le relais.
 * Un GET est retenté une fois ; une écriture n'est JAMAIS rejouée (si la
 * première avait abouti côté Google sans que la réponse revienne, la rejouer
 * créerait un doublon d'événement).
 *
 * @param {Object} args
 * @param {string | undefined} args.proxyUrl
 * @param {string | undefined} args.secret
 * @param {string} args.url
 * @param {string} [args.method]
 * @param {string | null} [args.body]
 * @param {typeof fetch} [args.fetchImpl]
 * @param {number} [args.timeoutMs]
 * @param {number} [args.retryDelayMs]
 * @returns {Promise<ProxyResult>}
 */
export async function proxyRequest({
  proxyUrl,
  secret,
  url,
  method = "GET",
  body = null,
  fetchImpl = fetch,
  timeoutMs = 30000,
  retryDelayMs = 1500,
}) {
  if (!proxyUrl || !secret) {
    throw new Error(
      "Relais Google mal configuré : GOOGLE_PROXY_URL et GOOGLE_PROXY_SECRET sont requis"
    );
  }
  if (typeof url !== "string" || !url.startsWith(CALENDAR_API_PREFIX)) {
    throw new Error(`Relais Google : URL hors API Calendar refusée (${String(url).slice(0, 80)})`);
  }
  const verb = String(method).toUpperCase();
  if (!ALLOWED_METHODS.has(verb)) {
    throw new Error(`Relais Google : méthode ${verb} refusée`);
  }
  if (body !== null && typeof body !== "string") {
    throw new Error("Relais Google : seul un corps de requête JSON (string) est supporté");
  }

  const payload = JSON.stringify({ secret, method: verb, url, body });
  const maxAttempts = verb === "GET" ? 2 : 1;
  let lastError = new Error("Relais Google : aucune tentative");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Apps Script répond à un POST par une redirection 302 vers
      // script.googleusercontent.com : fetch la suit (en GET), c'est attendu.
      // no-store : sans lui, Next met en cache la réponse de ce POST dans le
      // cron de sync et re-servirait la même liste d'événements à chaque run.
      const res = await fetchImpl(proxyUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: payload,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Relais Google HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          "Relais Google : réponse non JSON (déploiement Apps Script, accès « Tout le monde » ou quota à vérifier) : " +
            text.slice(0, 200)
        );
      }
      if (!isProxyResult(parsed)) {
        throw new Error(`Relais Google : réponse inattendue ${text.slice(0, 200)}`);
      }
      if (parsed.status === 403 && parsed.body.includes("proxy_forbidden")) {
        // Mauvais secret : inutile de retenter.
        throw Object.assign(
          new Error("Relais Google : secret refusé (GOOGLE_PROXY_SECRET ≠ PROXY_SECRET du script)"),
          { fatal: true }
        );
      }
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (/** @type {{ fatal?: boolean }} */ (lastError).fatal) break;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw lastError;
}
