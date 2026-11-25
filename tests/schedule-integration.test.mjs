/**
 * Tests d'intégration de l'agenda (25/11/2026) — base PostgreSQL ISOLÉE.
 *
 * Code réel du projet (moteur de disponibilité, réservations, actions admin,
 * synchronisation Google) sur une base de test neuve, créée puis détruite.
 * Google Calendar, emails et session sont remplacés par des doublures
 * (tests/helpers/fakes) : aucun appel externe, aucune donnée de production.
 *
 * Lancer :
 *   TEST_PG="host=/tmp port=55432 user=postgres" node --test tests/schedule-integration.test.mjs
 * Sans TEST_PG, les tests sont ignorés (comme tests/backup.test.mjs).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { PG, setupIntegration } from "./helpers/integration-env.mjs";
import { isWithinAvailability } from "../lib/availability-engine.mjs";

const BRUSSELS_TZ = "Europe/Brussels";
const MIAMI_TZ = "America/New_York";
const SKIP = !PG && "TEST_PG non défini (base PostgreSQL de test locale requise)";

const env = PG ? await setupIntegration() : null;
const mods = env
  ? {
      booking: await import("../lib/booking.ts"),
      admin: await import("../lib/admin.ts"),
      sync: await import("../lib/sync-engine.ts"),
      ops: await import("../lib/schedule-ops.mjs"),
      actions: await import("../app/admin/availability/schedule-actions.ts"),
      adminActions: await import("../app/admin/actions.ts"),
      cron: await import("../app/api/cron/sync-calendar/route.ts"),
      google: await import("./helpers/fakes/google-calendar.mjs"),
      emails: await import("./helpers/fakes/email.mjs")
    }
  : null;

if (env) {
  test.after(async () => {
    await env.teardown();
  });
}

// ─── Outils ────────────────────────────────────────────────────────────────

const B = (iso) => DateTime.fromISO(iso, { zone: BRUSSELS_TZ }).toUTC().toJSDate();
const plusHour = (d) => new Date(d.getTime() + 60 * 60 * 1000);
const hourIn = (d, zone) => DateTime.fromJSDate(d, { zone: "utc" }).setZone(zone).toFormat("HH:mm");

function fd(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
  return form;
}

async function resetDb() {
  env.sql(
    `TRUNCATE "RecurringBlockException","Booking","Block","RecurringBlock","AvailabilityOverride","AvailabilityRule","LocationPeriod","Client","SyncLog","GoogleToken","Settings","session_modes" RESTART IDENTITY CASCADE`
  );
  // Horaires Miami saisis en heure de Miami (comme en production depuis le
  // 13/11/2026) : 09:00-16:00 Miami = 15:00-22:00 Bruxelles en hiver.
  const rules = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => `(${d}, '09:00', '16:00', 'MIAMI')`)
    .join(",");
  env.sql(`INSERT INTO "AvailabilityRule" ("dayOfWeek","startTime","endTime","location") VALUES ${rules}`);
  env.sql(`INSERT INTO "Settings" ("id","updatedAt") VALUES (1, now())`);
  mods.google.fake.reset();
  mods.emails.sentEmails.length = 0;
}

async function availabilityMap(audience = "admin") {
  const slots = await mods.booking.getAvailability({ audience });
  return new Map(slots.map((s) => [s.start.getTime(), s]));
}

async function statusAt(iso, map) {
  const m = map ?? (await availabilityMap());
  return m.get(B(iso).getTime())?.status ?? "none";
}

async function newClient(name, credits = 10) {
  return env.prisma.client.create({
    data: { name, email: `${name.toLowerCase().replace(/\W+/g, "")}@test.local`, passwordHash: "x", creditsPerMonth: credits }
  });
}

/** Crée un RDV régulier via la vraie action admin (onglet « RDV réguliers »). */
async function createSeries({ clientId = "", dayOfWeek = 1, startTime = "21:00", endTime = "22:00", timeZone = BRUSSELS_TZ, note = "All-in" }) {
  try {
    await mods.adminActions.createRecurringBlockAction(fd({ dayOfWeek, startTime, endTime, timeZone, clientId, note }));
  } catch (signal) {
    if (!String(signal?.url ?? "").includes("success")) throw new Error(`Création de série refusée : ${signal?.url ?? signal}`);
  }
  return env.prisma.recurringBlock.findFirst({ orderBy: { id: "desc" } });
}

async function bookingAt(iso, clientId) {
  return env.prisma.booking.findFirst({ where: { startAt: B(iso), status: "CONFIRMED", ...(clientId ? { clientId } : {}) } });
}

// Horaires Miami de test (09:00-16:00 Miami) : pendant les semaines où les
// États-Unis et l'Europe n'ont pas changé d'heure en même temps (mars et
// fin octobre - début novembre), 21h Bruxelles tombe hors des horaires et
// n'est pas proposé du tout ("none"). C'est voulu (horaires lus à Miami).
const TEST_RULES = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, startTime: "09:00", endTime: "16:00", location: "MIAMI" }));
function offered(iso) {
  return isWithinAvailability(B(iso), plusHour(B(iso)), { rules: TEST_RULES, overrides: [], locationPeriods: [] });
}
/** Statut attendu d'un créneau « libre » : disponible s'il est dans les horaires. */
function freeStatus(iso) {
  return offered(iso) ? "available" : "none";
}

function mondaysBetween(fromIso, toIso) {
  const out = [];
  let d = DateTime.fromISO(fromIso, { zone: BRUSSELS_TZ });
  while (d.weekday !== 1) d = d.plus({ days: 1 });
  for (; d.toISODate() <= toIso; d = d.plus({ weeks: 1 })) out.push(d.toISODate());
  return out;
}

// ─── 1. Déplacement d'un rendez-vous simple ────────────────────────────────

test("déplacement d'un RDV simple : ancien créneau libéré, nouveau bloqué, Google mis à jour, pas de doublon", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Jean");
  const booked = await mods.booking.bookSlot(client.id, B("2027-02-17T18:00"), B("2027-02-17T19:00"));
  assert.ok(booked.booking, booked.error);
  await new Promise((r) => setTimeout(r, 50)); // push Google « fire-and-forget » de bookSlot
  const created = await env.prisma.booking.findUnique({ where: { id: booked.booking.id } });
  assert.ok(created.googleEventId, "événement Google créé");

  const result = await mods.admin.adminRescheduleBooking(created.id, "2027-02-17T20:00");
  assert.equal(result.ok, true, result.error);
  assert.equal(result.googleSynced, true);

  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-17T18:00", map), "available", "ancien créneau libre");
  assert.equal(await statusAt("2027-02-17T20:00", map), "booked", "nouveau créneau réservé");
  assert.equal(await env.prisma.booking.count(), 1, "aucun doublon en base");
  const moved = await env.prisma.booking.findUnique({ where: { id: created.id } });
  assert.equal(moved.syncStatus, "synced");
  const event = mods.google.fake.get(created.googleEventId);
  assert.equal(new Date(event.start.dateTime).getTime(), B("2027-02-17T20:00").getTime(), "Google à jour");
  assert.equal(mods.google.fake.liveEvents().length, 1, "un seul événement Google");
});

// ─── 2. Déplacement d'une occurrence récurrente ────────────────────────────

test("déplacement d'une occurrence (série sans client) : exception créée, 15/02 libéré, 24/02 bloqué, autres lundis bloqués", { skip: SKIP }, async () => {
  await resetDb();
  const series = await createSeries({ note: "All-in" });
  const state = await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "this", newDate: "2027-02-24", newStartTime: "21:00", newEndTime: "22:00", timeZone: BRUSSELS_TZ })
  );
  assert.equal(state.ok, true, state.error);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "available");
  assert.equal(await statusAt("2027-02-24T21:00", map), "blocked");
  assert.equal(await statusAt("2027-02-22T21:00", map), "blocked");
  assert.equal(await statusAt("2027-02-08T21:00", map), "blocked");
  const exception = await env.prisma.recurringBlockException.findFirst();
  assert.equal(exception.type, "MOVE");
  // Idempotence : rejouer la même action ne crée pas de seconde exception.
  await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "this", newDate: "2027-02-24", newStartTime: "21:00", newEndTime: "22:00", timeZone: BRUSSELS_TZ })
  );
  assert.equal(await env.prisma.recurringBlockException.count(), 1);
});

test("déplacement d'une occurrence de RDV régulier client : la réservation bouge, l'ancien créneau se libère, Google et email suivent", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("All-in");
  const series = await createSeries({ clientId: client.id });
  const original = await bookingAt("2027-02-15T21:00", client.id);
  assert.ok(original?.recurringBlockId === series.id, "réservation liée à la série");
  const eventId = original.googleEventId;
  assert.ok(eventId);

  const state = await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "this", newDate: "2027-02-24", newStartTime: "21:00", newEndTime: "22:00" })
  );
  assert.equal(state.ok, true, state.error);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "available", "plus de bloc fantôme le 15/02");
  assert.equal(await statusAt("2027-02-24T21:00", map), "booked");
  assert.equal(await statusAt("2027-02-22T21:00", map), "booked");
  const moved = await env.prisma.booking.findUnique({ where: { id: original.id } });
  assert.equal(moved.startAt.getTime(), B("2027-02-24T21:00").getTime());
  assert.equal(new Date(mods.google.fake.get(eventId).start.dateTime).getTime(), B("2027-02-24T21:00").getTime());
  assert.ok(mods.emails.sentEmails.some((e) => e.type === "updated" && e.bookingId === original.id));
});

// ─── 3. Modification d'une série complète / et des suivantes ───────────────

test("modification de toute la série : les RDV à venir suivent, l'ancien jour est libéré", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Marc");
  const series = await createSeries({ clientId: client.id, note: "Marc hebdo" });
  const before = await env.prisma.booking.count({ where: { status: "CONFIRMED" } });
  const state = await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "all", newDate: "2027-02-16", newStartTime: "20:00", newEndTime: "21:00" })
  );
  assert.equal(state.ok, true, state.error);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "available");
  assert.equal(await statusAt("2027-03-01T21:00", map), "available");
  assert.equal(await statusAt("2027-02-16T20:00", map), "booked");
  assert.equal(await statusAt("2027-03-02T20:00", map), "booked");
  assert.equal(await env.prisma.booking.count({ where: { status: "CONFIRMED" } }), before, "aucun RDV perdu ni dupliqué");
  const pending = await env.prisma.booking.count({ where: { syncStatus: { in: ["pending", "error"] } } });
  const google = mods.google.fake.liveEvents().filter((e) => new Date(e.start.dateTime).getUTCDay() === 2);
  assert.equal(google.length + pending, before, "chaque RDV déplacé est à jour dans Google ou en attente de renvoi");
});

test("modification « cette occurrence et les suivantes » : avant inchangé, après déplacé", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Lea");
  const series = await createSeries({ clientId: client.id, note: "Lea" });
  const state = await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-03-01", scope: "following", newDate: "2027-03-03", newStartTime: "19:00", newEndTime: "20:00" })
  );
  assert.equal(state.ok, true, state.error);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-22T21:00", map), "booked", "avant : inchangé");
  assert.equal(await statusAt("2027-03-01T21:00", map), "available", "à partir du 01/03 : lundi libéré");
  assert.equal(await statusAt("2027-03-03T19:00", map), "booked", "mercredi 19h");
  const blocks = await env.prisma.recurringBlock.findMany({ orderBy: { id: "asc" } });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].endDate.toISOString().slice(0, 10), "2027-02-28");
  assert.equal(blocks[1].startDate.toISOString().slice(0, 10), "2027-03-03");
});

// ─── 4-5. Suppression d'une occurrence / d'une série ───────────────────────

test("suppression d'une occurrence : seule cette date est libérée (RDV lié annulé, Google supprimé)", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Paul");
  const series = await createSeries({ clientId: client.id, note: "Paul" });
  const target = await bookingAt("2027-02-22T21:00", client.id);
  const state = await mods.actions.deleteOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-22", scope: "this" }));
  assert.equal(state.ok, true, state.error);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-02-22T21:00", map), "available");
  assert.equal(await statusAt("2027-03-01T21:00", map), "booked");
  const cancelled = await env.prisma.booking.findUnique({ where: { id: target.id } });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(mods.google.fake.get(target.googleEventId).status, "cancelled");
});

test("suppression d'une série : RDV à venir annulés, plus aucun blocage, Google nettoyé", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Zoe");
  const series = await createSeries({ clientId: client.id, note: "Zoe" });
  const state = await mods.actions.deleteOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "all" }));
  assert.equal(state.ok, true, state.error);
  assert.equal(await env.prisma.recurringBlock.count(), 0);
  assert.equal(await env.prisma.booking.count({ where: { status: "CONFIRMED" } }), 0);
  const map = await availabilityMap();
  for (const monday of mondaysBetween("2026-12-01", "2027-06-30")) {
    assert.equal(await statusAt(`${monday}T21:00`, map), freeStatus(`${monday}T21:00`), monday);
  }
  assert.equal(mods.google.fake.liveEvents().length, 0);
});

// ─── 6-8. Libération, disponibilité exceptionnelle, dates maintenues ──────

test("libération d'un créneau récurrent puis re-blocage d'une occurrence précise", { skip: SKIP }, async () => {
  await resetDb();
  const series = await createSeries({ note: "All-in" });
  const freed = await mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-04-05" }));
  assert.equal(freed.ok, true, freed.error);
  assert.equal(await statusAt("2027-04-05T21:00"), "available");
  assert.equal(await statusAt("2027-04-12T21:00"), "blocked");
  const reblocked = await mods.actions.restoreOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-04-05" }));
  assert.equal(reblocked.ok, true, reblocked.error);
  assert.equal(await statusAt("2027-04-05T21:00"), "blocked");
});

test("« Ajouter un créneau » : hors horaires et sur un bloc récurrent, sans effacer le reste du jour", { skip: SKIP }, async () => {
  await resetDb();
  await createSeries({ note: "All-in" });
  const before = await availabilityMap();
  const daySlots = (m, iso) => [...m.values()].filter((s) => DateTime.fromJSDate(s.start).setZone(BRUSSELS_TZ).toISODate() === iso);
  const beforeCount = daySlots(before, "2027-02-17").length;

  // Hors horaires (08:00 Bruxelles = 02:00 Miami).
  const outside = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2027-02-17", startTime: "08:00", endTime: "09:00" }));
  assert.equal(outside.ok, true, outside.error);
  const after = await availabilityMap();
  assert.equal(await statusAt("2027-02-17T08:00", after), "available");
  assert.equal(daySlots(after, "2027-02-17").length, beforeCount + 1, "les autres créneaux du jour sont conservés");

  // Sur le bloc récurrent All-in d'un lundi : libéré pour CETTE date uniquement.
  const onRecurring = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2027-03-01", startTime: "21:00", endTime: "22:00" }));
  assert.equal(onRecurring.ok, true, onRecurring.error);
  assert.match(onRecurring.message, /libérée/);
  const map = await availabilityMap();
  assert.equal(await statusAt("2027-03-01T21:00", map), "available");
  assert.equal(await statusAt("2027-03-08T21:00", map), "blocked", "les autres lundis restent bloqués");
});

test("conflits : une réservation ou une indisponibilité explicite n'est jamais écrasée (message explicite)", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Ana");
  const booked = await mods.booking.bookSlot(client.id, B("2027-02-18T17:00"), B("2027-02-18T18:00"));
  assert.ok(booked.booking);
  const refused = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2027-02-18", startTime: "17:00", endTime: "18:00" }));
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Réservation : Ana/);
  assert.match(refused.error, /jamais écrasée/);

  await env.prisma.availabilityOverride.create({
    data: { date: B("2027-02-19T00:00"), startTime: "16:00", endTime: "18:00", type: "BLOCK", note: "Dentiste" }
  });
  const explicit = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2027-02-19", startTime: "16:00", endTime: "17:00" }));
  assert.equal(explicit.ok, false);
  assert.match(explicit.error, /Dentiste/);
  assert.equal(await statusAt("2027-02-19T16:00"), "blocked", "indisponibilité toujours protégée");

  // Rebloquer une occurrence déjà prise par un client : refus explicite.
  const series = await createSeries({ note: "Groupe" , dayOfWeek: 4, startTime: "17:00", endTime: "18:00" });
  const restore = await mods.actions.restoreOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-18" }));
  assert.equal(restore.ok, true, "occurrence déjà bloquée (réservation présente)");
  await mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-25" }));
  const other = await newClient("Bob");
  const b2 = await mods.booking.bookSlot(other.id, B("2027-02-25T17:00"), B("2027-02-25T18:00"));
  assert.ok(b2.booking, b2.error);
  const restore2 = await mods.actions.restoreOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-25" }));
  assert.equal(restore2.ok, false);
  assert.match(restore2.error, /Bob/);
});

// ─── Synchronisation ───────────────────────────────────────────────────────

test("synchronisation dans les deux directions (déplacement, suppression, blocage perso)", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("All-in");
  await createSeries({ clientId: client.id });
  const occ = await bookingAt("2027-03-08T21:00", client.id);

  // Google → app : Geoffrey déplace l'occurrence dans Google Calendar.
  const edited = mods.google.fake.editFromGoogle(occ.googleEventId, {
    start: { dateTime: B("2027-03-10T21:00").toISOString() },
    end: { dateTime: B("2027-03-10T22:00").toISOString() }
  });
  const pulled = await mods.sync.pullFromGoogle(edited, edited.id);
  assert.equal(pulled.action, "booking_updated_from_google");
  let map = await availabilityMap();
  assert.equal(await statusAt("2027-03-08T21:00", map), "available", "ancienne occurrence libérée automatiquement");
  assert.equal(await statusAt("2027-03-10T21:00", map), "booked");

  // Google → app : suppression.
  mods.google.fake.deleteFromGoogle(occ.googleEventId);
  const deleted = await mods.sync.pullFromGoogle(null, occ.googleEventId);
  assert.equal(deleted.action, "booking_cancelled");
  map = await availabilityMap();
  assert.equal(await statusAt("2027-03-10T21:00", map), "available");

  // Google → app : événement perso → blocage, puis supprimé → libéré.
  const perso = mods.google.fake.addFromGoogle({
    summary: "Padel",
    start: { dateTime: B("2027-03-11T18:00").toISOString() },
    end: { dateTime: B("2027-03-11T19:00").toISOString() }
  });
  await mods.sync.pullFromGoogle(perso, perso.id);
  assert.equal(await statusAt("2027-03-11T18:00"), "blocked");
  mods.google.fake.deleteFromGoogle(perso.id);
  await mods.sync.pullFromGoogle(null, perso.id);
  assert.equal(await statusAt("2027-03-11T18:00"), "available");

  // App → Google : déplacement depuis l'admin.
  const other = await bookingAt("2027-04-05T21:00", client.id);
  const res = await mods.admin.adminRescheduleBooking(other.id, "2027-04-06T21:00");
  assert.equal(res.ok, true, res.error);
  assert.equal(new Date(mods.google.fake.get(other.googleEventId).start.dateTime).getTime(), B("2027-04-06T21:00").getTime());
  assert.equal(await statusAt("2027-04-05T21:00"), "available", "ancien créneau libéré");
});

test("modification locale non encore poussée : jamais écrasée par l'ancienne version Google, puis repoussée", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Nina");
  const booked = await mods.booking.bookSlot(client.id, B("2027-02-17T16:00"), B("2027-02-17T17:00"));
  await new Promise((r) => setTimeout(r, 50));
  const b = await env.prisma.booking.findUnique({ where: { id: booked.booking.id } });
  const staleGoogle = mods.google.fake.get(b.googleEventId);

  mods.google.fake.failNext("update", 1);
  const res = await mods.admin.adminRescheduleBooking(b.id, "2027-02-17T18:00");
  assert.equal(res.ok, true);
  assert.equal(res.googleSynced, false, "échec Google signalé, pas de faux succès");
  const local = await env.prisma.booking.findUnique({ where: { id: b.id } });
  assert.equal(local.syncStatus, "error");

  // Une notification Google arrive avec une version différente mais plus ancienne.
  const pulled = await mods.sync.pullFromGoogle({ ...staleGoogle, etag: '"autre"', updated: new Date(Date.now() - 60000).toISOString() }, b.googleEventId);
  assert.equal(pulled.action, "local_newer_kept");
  assert.equal((await env.prisma.booking.findUnique({ where: { id: b.id } })).startAt.getTime(), B("2027-02-17T18:00").getTime());

  const retry = await mods.sync.retryPendingUpdates();
  assert.equal(retry.pushed, 1);
  assert.equal(new Date(mods.google.fake.get(b.googleEventId).start.dateTime).getTime(), B("2027-02-17T18:00").getTime());
  assert.equal((await env.prisma.booking.findUnique({ where: { id: b.id } })).syncStatus, "synced");
});

test("prévention des doublons : même événement reçu deux fois, création Google déjà faite", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Hugo");
  const fromGoogle = mods.google.fake.addFromGoogle({
    summary: "RDV - Hugo",
    start: { dateTime: B("2027-02-19T17:00").toISOString() },
    end: { dateTime: B("2027-02-19T18:00").toISOString() }
  });
  await mods.sync.pullFromGoogle(fromGoogle, fromGoogle.id);
  await mods.sync.pullFromGoogle(fromGoogle, fromGoogle.id);
  await Promise.all([mods.sync.pullFromGoogle(fromGoogle, fromGoogle.id), mods.sync.pullFromGoogle(fromGoogle, fromGoogle.id)]);
  const importedRecords =
    (await env.prisma.booking.count({ where: { googleEventId: fromGoogle.id } })) +
    (await env.prisma.block.count({ where: { googleEventId: fromGoogle.id } }));
  assert.equal(importedRecords, 1, "un seul enregistrement pour l'événement");

  // Réservation créée dans l'app, événement créé chez Google mais réponse perdue.
  const local = await env.prisma.booking.create({
    data: { clientId: client.id, startAt: B("2027-02-20T17:00"), endAt: B("2027-02-20T18:00"), updatedAt: new Date() }
  });
  mods.google.fake.createSilently({
    summary: "RDV — Hugo",
    start: { dateTime: local.startAt.toISOString() },
    end: { dateTime: local.endAt.toISOString() },
    extendedProperties: { private: { appSource: "your-saas-app", recordType: "booking", recordId: String(local.id) } }
  });
  const repush = await mods.sync.repushUnsyncedBookings();
  assert.equal(repush.pushed, 1);
  const tagged = mods.google.fake.liveEvents().filter((e) => e.extendedProperties?.private?.recordId === String(local.id));
  assert.equal(tagged.length, 1, "événement rattaché, pas recréé");

  // Double clic sur « Libérer » : une seule exception.
  const series = await createSeries({ note: "All-in" });
  await Promise.all([
    mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-03-22" })),
    mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-03-22" }))
  ]);
  assert.equal(await env.prisma.recurringBlockException.count(), 1);
});

test("prévention des boucles : l'écho de nos propres écritures ne relance aucune écriture", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Ivy");
  await createSeries({ clientId: client.id, note: "Ivy" });
  const writes = () => mods.google.fake.state.calls.filter((c) => ["create", "update", "delete"].includes(c.op)).length;
  const afterCreate = writes();
  for (let cycle = 0; cycle < 3; cycle++) {
    const { items } = await mods.google.fetchChangedEvents(null);
    for (const event of items) {
      const r = await mods.sync.pullFromGoogle(event.status === "cancelled" ? null : event, event.id);
      assert.notEqual(r.action, "booking_updated_from_google", "écho traité comme un changement");
    }
    await mods.sync.repushUnsyncedBookings();
    await mods.sync.retryPendingUpdates();
  }
  assert.equal(writes(), afterCreate, "aucune écriture Google supplémentaire");
});

test("synchro partielle : le jeton n'avance pas et la synchro n'est pas déclarée réussie", { skip: SKIP }, async () => {
  await resetDb();
  await env.prisma.googleToken.create({ data: { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3600e3), updatedAt: new Date(), syncToken: "tok0" } });
  mods.google.fake.addFromGoogle({ summary: "Perso", start: { dateTime: B("2027-02-19T15:00").toISOString() }, end: { dateTime: B("2027-02-19T16:00").toISOString() } });
  const broken = mods.google.fake.addFromGoogle({ summary: "Cassé", start: { dateTime: "pas-une-date" }, end: { dateTime: "pas-une-date" } });
  const req = { headers: new Headers({ authorization: `Bearer ${process.env.CRON_SECRET}` }) };
  await mods.cron.GET(req);
  let token = await env.prisma.googleToken.findFirst();
  assert.equal(token.syncToken, "tok0", "jeton conservé : l'événement en erreur sera rejoué");
  assert.equal(await env.prisma.syncLog.count({ where: { action: "sync_ok" } }), 0);
  assert.ok((await env.prisma.syncLog.count({ where: { action: "sync_partial" } })) >= 1);

  mods.google.fake.editFromGoogle(broken.id, {
    start: { dateTime: B("2027-02-19T16:00").toISOString() },
    end: { dateTime: B("2027-02-19T17:00").toISOString() }
  });
  await mods.cron.GET(req);
  token = await env.prisma.googleToken.findFirst();
  assert.notEqual(token.syncToken, "tok0", "jeton avancé une fois tout traité");
  assert.equal(await env.prisma.block.count(), 2, "aucun doublon après rejeu");
});

// ─── Interface client, redémarrage, changements d'heure ───────────────────

test("disponibilités client : libération visible tout de suite, réservable, sans fuite d'informations", { skip: SKIP }, async () => {
  await resetDb();
  const series = await createSeries({ note: "RDV hebdo — Client confidentiel" });
  const client = await newClient("Eva");
  const refused = await mods.booking.bookSlot(client.id, B("2027-03-29T21:00"), B("2027-03-29T22:00"));
  assert.match(refused.error ?? "", /bloqué/);
  const publicBefore = await availabilityMap("public");
  const blocked = publicBefore.get(B("2027-03-29T21:00").getTime());
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockReason, null, "aucune cause transmise au client");
  assert.deepEqual(blocked.blockers, []);

  await mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-03-29" }));
  const publicAfter = await availabilityMap("public");
  assert.equal(publicAfter.get(B("2027-03-29T21:00").getTime()).status, "available");
  const ok = await mods.booking.bookSlot(client.id, B("2027-03-29T21:00"), B("2027-03-29T22:00"));
  assert.ok(ok.booking, ok.error);

  // Admin et client voient la même chose (mêmes statuts, même instant).
  const [adminView, publicView] = [await availabilityMap("admin"), await availabilityMap("public")];
  assert.equal(adminView.size, publicView.size);
  for (const [key, slot] of publicView) assert.equal(adminView.get(key)?.status, slot.status);
  assert.equal(publicView.get(B("2027-03-29T21:00").getTime()).status, "booked");
});

test("redémarrage de l'application : rien n'est perdu (tout est en base)", { skip: SKIP }, async () => {
  await resetDb();
  const series = await createSeries({ note: "All-in" });
  await mods.actions.releaseOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-08" }));
  await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "this", newDate: "2027-02-24", newStartTime: "21:00", newEndTime: "22:00" })
  );
  const before = await availabilityMap();
  await env.swapClient(); // nouvelle connexion, comme après un redéploiement
  const after = await availabilityMap();
  assert.equal(after.size, before.size);
  for (const [key, slot] of before) assert.equal(after.get(key)?.status, slot.status);
  assert.equal(await statusAt("2027-02-08T21:00", after), "available");
  assert.equal(await statusAt("2027-02-24T21:00", after), "blocked");
});

test("changements d'heure Belgique et États-Unis : 21h Bruxelles reste 21h, Miami suit", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Dst");
  await createSeries({ clientId: client.id, note: "Bxl" });
  await createSeries({ dayOfWeek: 3, startTime: "15:00", endTime: "16:00", timeZone: MIAMI_TZ, note: "Miami" });
  for (const [iso, miami] of [
    ["2027-03-08", "15:00"],
    ["2027-03-15", "16:00"], // US à l'heure d'été, pas encore l'Europe
    ["2027-03-29", "15:00"],
    ["2027-11-01", "16:00"] // Europe revenue à l'heure d'hiver, pas encore les US
  ]) {
    const b = await bookingAt(`${iso}T21:00`, client.id);
    assert.ok(b, `RDV du ${iso} à 21h Bruxelles`);
    assert.equal(hourIn(b.startAt, MIAMI_TZ), miami, iso);
  }
  const map = await availabilityMap();
  // Série Miami : 15h Miami = 21h Bruxelles d'habitude, 20h pendant le décalage.
  assert.equal(await statusAt("2027-03-10T21:00", map), "blocked");
  assert.equal(await statusAt("2027-03-17T20:00", map), "blocked");
  assert.equal(await statusAt("2027-03-17T21:00", map), "none", "21h Bruxelles hors horaires Miami cette semaine-là");
  // Heure inexistante (passage à l'heure d'été en Belgique).
  const gap = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2027-03-28", startTime: "02:00", endTime: "03:00" }));
  assert.equal(gap.ok, false);
  assert.match(gap.error, /n'existe pas/);
});

// ─── Reproduction exacte du cas de Geoffrey ────────────────────────────────

test("cas Geoffrey (RDV régulier client « All-in ») : déplacé du 15 au 24/02, créneau libéré sauf 15 et 22/02", { skip: SKIP }, async () => {
  await resetDb();
  const allIn = await newClient("All-in");
  const series = await createSeries({ clientId: allIn.id, note: "All-in" });

  // 1. Le déplacement qui créait le bloc fantôme (reprogrammation admin classique).
  const feb15 = await bookingAt("2027-02-15T21:00", allIn.id);
  const moved = await mods.admin.adminRescheduleBooking(feb15.id, "2027-02-24T21:00");
  assert.equal(moved.ok, true, moved.error);
  let map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "available", "plus de bloc fantôme le 15/02");
  assert.equal(await statusAt("2027-02-24T21:00", map), "booked");

  // 2. Libérer le créneau All-in, sauf les 15 et 22/02 : série bornée au 15-22/02.
  const period = await mods.actions.setSeriesPeriodAction(
    null,
    fd({ recurringBlockId: series.id, startDate: "2027-02-15", endDate: "2027-02-22", cancelOutside: "on" })
  );
  assert.equal(period.ok, true, period.error);
  // 3. Le 15/02 doit rester bloqué (demande explicite, alors que son RDV a été
  //    déplacé au 24/02) : blocage volontaire de cette occurrence.
  const keep15 = await mods.actions.restoreOccurrenceAction(null, fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15" }));
  assert.equal(keep15.ok, true, keep15.error);

  map = await availabilityMap();
  const pub = await availabilityMap("public");
  for (const monday of mondaysBetween("2026-11-30", "2027-11-15")) {
    const iso = `${monday}T21:00`;
    const expected = monday === "2027-02-22" ? "booked" : monday === "2027-02-15" ? "blocked" : freeStatus(iso);
    assert.equal(await statusAt(iso, map), expected, `admin ${monday}`);
    assert.equal(pub.get(B(iso).getTime())?.status ?? "none", expected, `client ${monday}`);
    const check = await mods.booking.checkSlotAvailability(B(iso), plusHour(B(iso)));
    assert.equal(check.ok, expected === "available", `serveur ${monday}`);
  }
  assert.equal(await statusAt("2027-02-24T21:00", map), "booked", "RDV déplacé au 24/02 conservé à 21h");
  const feb24 = await env.prisma.booking.findUnique({ where: { id: feb15.id } });
  assert.equal(feb24.status, "CONFIRMED");
  assert.equal(hourIn(feb24.startAt, BRUSSELS_TZ), "21:00");
  assert.equal(hourIn(feb24.startAt, MIAMI_TZ), "15:00");

  // Calendrier synchronisé identique : seuls les RDV du 22/02 et du 24/02 restent.
  const live = mods.google.fake.liveEvents().map((e) => new Date(e.start.dateTime).getTime()).sort();
  assert.deepEqual(live, [B("2027-02-22T21:00").getTime(), B("2027-02-24T21:00").getTime()]);
  const confirmed = await env.prisma.booking.findMany({ where: { status: "CONFIRMED" }, orderBy: { startAt: "asc" } });
  assert.deepEqual(confirmed.map((b) => b.startAt.getTime()), live, "app et Google cohérents");
});

test("cas Geoffrey (bloc « All-in » sans client) : « Ajouter un créneau » libère enfin, déplacement 15→24/02, période 15-22/02", { skip: SKIP }, async () => {
  await resetDb();
  const series = await createSeries({ note: "All-in" });
  // Le bug signalé : « Ajouter un créneau » sur le bloc ne rendait rien disponible.
  const add = await mods.actions.addAvailabilitySlotAction(null, fd({ date: "2026-12-07", startTime: "21:00", endTime: "22:00" }));
  assert.equal(add.ok, true, add.error);
  assert.equal(await statusAt("2026-12-07T21:00"), "available");

  await mods.actions.moveOccurrenceAction(
    null,
    fd({ recurringBlockId: series.id, occurrenceDate: "2027-02-15", scope: "this", newDate: "2027-02-24", newStartTime: "21:00", newEndTime: "22:00", keepOriginalBlocked: "on" })
  );
  const period = await mods.actions.setSeriesPeriodAction(null, fd({ recurringBlockId: series.id, startDate: "2027-02-15", endDate: "2027-02-22" }));
  assert.equal(period.ok, true, period.error);
  const map = await availabilityMap();
  for (const monday of mondaysBetween("2026-11-30", "2027-11-15")) {
    const expected = monday === "2027-02-15" || monday === "2027-02-22" ? "blocked" : freeStatus(`${monday}T21:00`);
    assert.equal(await statusAt(`${monday}T21:00`, map), expected, monday);
  }
  assert.equal(await statusAt("2027-02-24T21:00", map), "blocked", "occurrence déplacée au 24/02");
  const reasons = map.get(B("2027-02-15T21:00").getTime()).blockers.map((b) => b.kind);
  assert.deepEqual(reasons, ["manual_block"], "le 15/02 est un blocage volontaire, identifié comme tel");
});

// ─── Migration et réconciliation des fantômes existants ───────────────────

test("migration + réconciliation : liens sûrs automatiques, fantômes prouvés et probables traités sans suppression", { skip: SKIP }, async () => {
  await resetDb();
  const { readFileSync } = await import("node:fs");
  const reconcile = await import("../lib/recurring-reconcile.mjs");
  const migration = readFileSync(new URL("../prisma/migrations/20261125120000_recurring_occurrence_exceptions/migration.sql", import.meta.url), "utf8");

  const client = await newClient("All-in");
  const series = await createSeries({ clientId: client.id });
  const total = await env.prisma.booking.count();
  // État « avant correctif » : aucune réservation liée, un RDV déplacé du
  // 15/02 au 24/02 et un RDV du 12/04 annulé, faits par l'ancien code.
  env.sql(`UPDATE "Booking" SET "recurringBlockId" = NULL, "occurrenceDate" = NULL`);
  const feb15 = await bookingAt("2027-02-15T21:00", client.id);
  await env.prisma.booking.update({ where: { id: feb15.id }, data: { startAt: B("2027-02-24T21:00"), endAt: B("2027-02-24T22:00") } });
  const apr12 = await bookingAt("2027-04-12T21:00", client.id);
  await env.prisma.booking.update({ where: { id: apr12.id }, data: { status: "CANCELLED" } });
  let map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "blocked", "fantôme reproduit (15/02)");
  assert.equal(await statusAt("2027-04-12T21:00", map), "blocked", "fantôme reproduit (12/04)");

  // Migration rejouée (idempotente) : liens SÛRS seulement.
  env.sql(migration);
  env.sql(migration);
  const linked = await env.prisma.booking.count({ where: { recurringBlockId: series.id } });
  assert.equal(linked, total - 2, "toutes les réservations sur le motif sont liées, pas les cas ambigus");
  assert.equal(await env.prisma.booking.count(), total, "aucune réservation supprimée");

  const findings = await reconcile.analyzeRecurringGhosts(env.prisma);
  assert.deepEqual(findings.verified.map((f) => [f.occurrenceDate, f.bookingId]), [["2027-04-12", apr12.id]]);
  assert.deepEqual(findings.probable.map((f) => [f.occurrenceDate, f.bookingId]), [["2027-02-15", feb15.id]]);

  await reconcile.applyOccurrenceLinks(env.prisma, findings.verified.map((f) => ({ ...f })));
  await reconcile.applyOccurrenceLinks(env.prisma, findings.probable.map((f) => ({ ...f })));
  map = await availabilityMap();
  assert.equal(await statusAt("2027-02-15T21:00", map), "available");
  assert.equal(await statusAt("2027-04-12T21:00", map), "available");
  assert.equal(await statusAt("2027-02-24T21:00", map), "booked");
  assert.equal(await statusAt("2027-03-01T21:00", map), "booked");
  assert.equal((await reconcile.analyzeRecurringGhosts(env.prisma)).verified.length, 0, "idempotent");

  // Ouverture « Ajouter un créneau » restée sans effet avec l'ancien code.
  const allIn = await createSeries({ note: "All-in", dayOfWeek: 2, startTime: "21:00", endTime: "22:00" });
  await env.prisma.availabilityOverride.create({ data: { date: B("2027-04-06T00:00"), startTime: "15:00", endTime: "22:00", type: "OPEN" } });
  const again = await reconcile.analyzeRecurringGhosts(env.prisma);
  const opening = again.ineffectiveOpenings.find((o) => o.recurringBlockId === allIn.id);
  assert.equal(opening?.occurrenceDate, "2027-04-06");
  await reconcile.applyOccurrenceReleases(env.prisma, [opening], "test");
  assert.equal(await statusAt("2027-04-06T21:00"), "available");
});
