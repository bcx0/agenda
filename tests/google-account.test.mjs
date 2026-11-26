/**
 * Case admin « Compte Google connecté » (26/11/2026) — base PostgreSQL ISOLÉE.
 * La route interroge Google en direct (doublure en test) : compte réellement
 * branché, écart avec le compte enregistré, panne Google, accès réservé.
 *
 * Lancer :
 *   TEST_PG="host=/tmp port=55432 user=postgres" node --test tests/google-account.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PG, setupIntegration } from "./helpers/integration-env.mjs";

const SKIP = !PG && "TEST_PG non défini (base PostgreSQL de test locale requise)";
const env = PG ? await setupIntegration() : null;
const mods = env
  ? {
      account: await import("../app/api/admin/google-account/route.ts"),
      google: await import("./helpers/fakes/google-calendar.mjs")
    }
  : null;

if (env) {
  test.after(async () => {
    await env.teardown();
  });
}

async function resetDb() {
  env.sql(`TRUNCATE "GoogleToken","SyncLog" RESTART IDENTITY CASCADE`);
  await env.prisma.googleToken.create({
    data: { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3600e3), updatedAt: new Date(), googleEmail: "agenda-test@example.com" }
  });
  mods.google.fake.reset();
}

test("case « compte Google connecté » : compte renvoyé par Google en direct, écart avec le compte enregistré visible, accès réservé à l'admin", { skip: SKIP }, async () => {
  await resetDb();
  mods.google.fake.state.accountEmail = "agenda-test@example.com";
  let res = await mods.account.GET();
  assert.equal(res.body.connected, true);
  assert.equal(res.body.liveEmail, "agenda-test@example.com");
  assert.equal(res.body.storedEmail, "agenda-test@example.com");

  // Un autre compte est en réalité branché : la case le montre.
  mods.google.fake.state.accountEmail = "autre-compte@example.com";
  res = await mods.account.GET();
  assert.equal(res.body.liveEmail, "autre-compte@example.com");
  assert.equal(res.body.storedEmail, "agenda-test@example.com");

  // Google ne répond pas : pas de faux « connecté ».
  mods.google.fake.failNext("account", 1);
  res = await mods.account.GET();
  assert.equal(res.body.liveEmail, null);
  assert.ok(res.body.error);

  // Aucun compte connecté.
  await env.prisma.googleToken.deleteMany();
  res = await mods.account.GET();
  assert.equal(res.body.connected, false);

  // Sans session admin : refus.
  globalThis.__TEST_NO_ADMIN__ = true;
  res = await mods.account.GET();
  globalThis.__TEST_NO_ADMIN__ = false;
  assert.equal(res.status, 401);
});
