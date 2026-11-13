/**
 * Garde-fou : aucun appel sortant critique ne doit passer par le cache fetch
 * de Next. Lancer : node --test tests/google-no-store.test.mjs
 *
 * Cause des pannes de synchro Google (« post_refresh_401 », trouvée le
 * 13/11/2026) : dans un route handler GET en force-dynamic, Next 14 met en
 * cache la réponse de fetch, POST compris. Le refresh du jeton Google
 * renvoyait donc indéfiniment le même access token périmé. Ces tests échouent
 * si quelqu'un retire `cache: 'no-store'` ou `fetchCache = 'force-no-store'`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { proxyRequest, CALENDAR_API_PREFIX } from "../lib/google-proxy.mjs";

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

/** Texte complet de chaque appel `fetch(...)` du source (parenthèses appariées, chaînes ignorées). */
function fetchCalls(source) {
  const calls = [];
  const pattern = /(?<![.\w])fetch\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let i = match.index + "fetch".length; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === "\\") i++;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") quote = char;
      else if (char === "(") depth++;
      else if (char === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    assert.notEqual(end, -1, "appel fetch non terminé dans le source");
    calls.push(source.slice(match.index, end + 1));
  }
  return calls;
}

test("fetchCalls : extrait chaque appel en entier", () => {
  const calls = fetchCalls("a = await fetch(u, { body: f('x)'), cache: 'no-store' })\nb = fetch(v)\nc = obj.fetch(w)");
  assert.deepEqual(calls, ["fetch(u, { body: f('x)'), cache: 'no-store' })", "fetch(v)"]);
});

test("lib/google-calendar.ts : chaque fetch (refresh du jeton et API Calendar) est en no-store", () => {
  const calls = fetchCalls(read("lib/google-calendar.ts"));
  assert.ok(calls.length >= 5, `5 appels attendus au minimum, ${calls.length} trouvés`);
  for (const call of calls) {
    assert.match(call, /cache:\s*['"]no-store['"]/, `fetch sans cache: 'no-store' :\n${call.slice(0, 160)}`);
  }
  const refresh = calls.find((call) => call.includes("oauth2.googleapis.com/token"));
  assert.ok(refresh, "appel de refresh du jeton introuvable");
});

test("relais Apps Script : la requête part en no-store", async () => {
  let seenInit = null;
  const fetchImpl = async (_url, init) => {
    seenInit = init;
    return new Response(JSON.stringify({ status: 200, body: "{}" }), { status: 200 });
  };
  await proxyRequest({
    proxyUrl: "http://relais.test/exec",
    secret: "s3cret",
    url: `${CALENDAR_API_PREFIX}calendars/primary/events`,
    fetchImpl,
  });
  assert.equal(seenInit?.cache, "no-store");
});

test("crons : chaque route app/api/cron/* interdit le cache fetch", () => {
  const cronDir = new URL("../app/api/cron/", import.meta.url);
  const routes = readdirSync(cronDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `app/api/cron/${entry.name}/route.ts`);
  assert.ok(routes.length >= 3, `3 crons attendus au minimum, ${routes.length} trouvés`);
  for (const route of routes) {
    assert.match(
      read(route),
      /^export const fetchCache = 'force-no-store'$/m,
      `${route} doit exporter fetchCache = 'force-no-store'`
    );
  }
});
