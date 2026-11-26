/**
 * Annulations et Google Calendar (26/11/2026) — base PostgreSQL ISOLÉE.
 *
 * Reproduit le cas signalé par Geoffrey : un RDV annulé par le client depuis
 * son espace reste dans Google Calendar, à côté du RDV valide d'un autre
 * client sur le même créneau. Vérifie les annulations (client, admin), la
 * reprise après échec, l'absence de doublon et de réapparition, la
 * réconciliation des fantômes déjà présents.
 *
 * Code réel du projet sur une base de test neuve ; Google Calendar, emails et
 * session sont des doublures : aucun appel externe, aucune donnée de
 * production. Les clients de test portent les noms du cas signalé.
 *
 * Lancer :
 *   TEST_PG="host=/tmp port=55432 user=postgres" node --test tests/sync-cancellation.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { PG, setupIntegration } from "./helpers/integration-env.mjs";

const BRUSSELS_TZ = "Europe/Brussels";
const MIAMI_TZ = "America/New_York";
const SKIP = !PG && "TEST_PG non défini (base PostgreSQL de test locale requise)";
const APP = "your-saas-app";

const env = PG ? await setupIntegration() : null;
const mods = env
  ? {
      booking: await import("../lib/booking.ts"),
      admin: await import("../lib/admin.ts"),
      sync: await import("../lib/sync-engine.ts"),
      manage: await import("../app/rdv/manage/[token]/actions.ts"),
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

const B = (iso) => DateTime.fromISO(iso, { zone: BRUSSELS_TZ }).toUTC().toJSDate();
const plusHour = (d) => new Date(d.getTime() + 60 * 60 * 1000);
const hourIn = (d, zone) => DateTime.fromJSDate(d, { zone: "utc" }).setZone(zone).toFormat("HH:mm");
// Vendredi 19h-20h Bruxelles = 13h-14h Miami (hiver), comme le cas signalé,
// mais à une date lointaine pour respecter les règles 48 h / 72 h.
const SLOT = "2027-01-29T19:00";
const CRON = { headers: new Headers({ authorization: `Bearer ${process.env.CRON_SECRET}` }) };

async function resetDb() {
  env.sql(
    `TRUNCATE "RecurringBlockException","Booking","Block","RecurringBlock","AvailabilityOverride","AvailabilityRule","LocationPeriod","Client","SyncLog","GoogleToken","Settings","session_modes" RESTART IDENTITY CASCADE`
  );
  const rules = [1, 2, 3, 4, 5, 6, 7].map((d) => `(${d}, '09:00', '16:00', 'MIAMI')`).join(",");
  env.sql(`INSERT INTO "AvailabilityRule" ("dayOfWeek","startTime","endTime","location") VALUES ${rules}`);
  env.sql(`INSERT INTO "Settings" ("id","updatedAt") VALUES (1, now())`);
  await env.prisma.googleToken.create({
    data: { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3600e3), updatedAt: new Date(), syncToken: null, googleEmail: "agenda-test@example.com" }
  });
  mods.google.fake.reset();
  mods.google.fake.state.accountEmail = undefined;
  mods.emails.sentEmails.length = 0;
}

async function newClient(name) {
  return env.prisma.client.create({
    data: { name, email: `${name.toLowerCase().replace(/\W+/g, "")}@test.local`, passwordHash: "x", creditsPerMonth: 10 }
  });
}

async function book(client, iso = SLOT) {
  const result = await mods.booking.bookSlot(client.id, B(iso), plusHour(B(iso)));
  assert.ok(result.booking, result.error);
  return env.prisma.booking.findUnique({ where: { id: result.booking.id } });
}

const liveAt = (iso) => mods.google.fake.liveEvents().filter((e) => new Date(e.start.dateTime).getTime() === B(iso).getTime());
const reload = (id) => env.prisma.booking.findUnique({ where: { id } });
const tagOf = (b) => ({ private: { appSource: APP, recordType: "booking", recordId: String(b.id) } });
async function waitForLogs() {
  await new Promise((r) => setTimeout(r, 80)); // SyncLog est écrit sans attendre
}

/** Événement créé chez Google pour une réservation, SANS que l'app le sache. */
function orphanEventFor(b, name) {
  return mods.google.fake.createSilently({
    summary: `RDV — ${name}`,
    start: { dateTime: b.startAt.toISOString(), timeZone: BRUSSELS_TZ },
    end: { dateTime: b.endAt.toISOString(), timeZone: BRUSSELS_TZ },
    extendedProperties: tagOf(b)
  });
}

// ─── Réservation : l'événement Google est connu de l'app dès la réponse ────

test("réservation : l'identifiant de l'événement Google est enregistré avant la réponse (plus de création non attendue)", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Massimo Renaud");
  const result = await mods.booking.bookSlot(client.id, B(SLOT), plusHour(B(SLOT)));
  // AUCUNE attente : avec l'ancien code (push non attendu), l'identifiant
  // n'était pas encore en base ici, et pouvait ne jamais l'être sur Vercel.
  const b = await reload(result.booking.id);
  assert.ok(b.googleEventId, "identifiant enregistré");
  assert.equal(b.syncStatus, "synced");
  assert.equal(hourIn(b.startAt, BRUSSELS_TZ), "19:00");
  assert.equal(hourIn(b.startAt, MIAMI_TZ), "13:00", "aucun décalage Bruxelles / Miami");
  assert.equal(liveAt(SLOT).length, 1);
});

test("réservation toute récente sans identifiant : le cron ne crée pas de second événement (délai de 2 minutes)", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Massimo Renaud");
  const b = await env.prisma.booking.create({
    data: { clientId: client.id, startAt: B(SLOT), endAt: plusHour(B(SLOT)), updatedAt: new Date() }
  });
  const first = await mods.sync.repushUnsyncedBookings();
  assert.equal(first.pushed, 0, "la requête de réservation a la main pendant 2 minutes");
  assert.equal(mods.google.fake.liveEvents().length, 0);
  await env.prisma.booking.update({ where: { id: b.id }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });
  const second = await mods.sync.repushUnsyncedBookings();
  assert.equal(second.pushed, 1);
  const third = await mods.sync.repushUnsyncedBookings();
  assert.equal(third.pushed, 0, "idempotent");
  assert.equal(mods.google.fake.liveEvents().length, 1, "un seul événement");
});

// ─── Annulation par le client ──────────────────────────────────────────────

test("annulation par le client (lien de gestion) : l'événement associé est supprimé de Google Calendar", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Massimo Renaud");
  const b = await book(client);
  const eventId = b.googleEventId;
  await assert.rejects(
    mods.manage.cancelAppointmentAction((() => { const f = new FormData(); f.set("token", b.manageToken); return f; })()),
    (signal) => String(signal.url).includes("success=cancelled")
  );
  const after = await reload(b.id);
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.syncStatus, "cancelled", "suppression confirmée par Google");
  assert.equal(mods.google.fake.get(eventId).status, "cancelled", "événement supprimé par son identifiant exact");
  assert.equal(liveAt(SLOT).length, 0);
  assert.ok(mods.emails.sentEmails.some((e) => e.type === "cancelled" && e.bookingId === b.id));
});

test("cas signalé : RDV annulé dont l'identifiant Google n'a jamais été enregistré, puis RDV valide d'un autre client sur le même créneau", { skip: SKIP }, async () => {
  await resetDb();
  const massimo = await newClient("Massimo Renaud");
  const florian = await newClient("Florian Mairesse");

  // État produit par l'ancien code : événement créé chez Google, fonction
  // coupée avant l'enregistrement de son identifiant.
  const m = await book(massimo);
  const ghostId = m.googleEventId;
  await env.prisma.booking.update({ where: { id: m.id }, data: { googleEventId: null, googleEtag: null, syncStatus: "pending" } });

  // Le client annule depuis son espace.
  const cancelled = await mods.booking.cancelBooking(m.id);
  assert.equal(cancelled.ok, true);
  assert.equal(mods.google.fake.get(ghostId).status, "cancelled", "événement retrouvé par l'étiquette de la réservation et supprimé");
  assert.equal((await reload(m.id)).syncStatus, "cancelled");

  // Florian réserve le créneau libéré.
  const f = await book(florian);
  const live = liveAt(SLOT);
  assert.deepEqual(live.map((e) => e.id), [f.googleEventId], "seul le RDV de Florian reste dans Google Calendar");
  assert.equal(live[0].summary, "RDV — Florian Mairesse");
  assert.equal((await reload(f.id)).status, "CONFIRMED");
});

// ─── Données déjà incohérentes (réconciliation) ────────────────────────────

test("fantôme déjà présent : supprimé au premier passage du cron par son identifiant exact, le RDV valide est intact, rien ne réapparaît", { skip: SKIP }, async () => {
  await resetDb();
  const massimo = await newClient("Massimo Renaud");
  const florian = await newClient("Florian Mairesse");

  // Annulé avec l'ANCIEN code : aucun identifiant connu, rien supprimé,
  // réservation marquée « cancelled » alors que l'événement vit toujours.
  const m = await env.prisma.booking.create({
    data: {
      clientId: massimo.id, startAt: B(SLOT), endAt: plusHour(B(SLOT)), status: "CANCELLED", syncStatus: "cancelled",
      createdAt: new Date(Date.now() - 3 * 24 * 3600e3), updatedAt: new Date()
    }
  });
  const ghost = orphanEventFor(m, "Massimo Renaud");
  const f = await book(florian);
  // Événements indépendants de l'app sur le même créneau : jamais concernés.
  const perso = mods.google.fake.addFromGoogle({
    summary: "Appel perso",
    start: { dateTime: B(SLOT).toISOString() },
    end: { dateTime: plusHour(B(SLOT)).toISOString() }
  });
  assert.equal(liveAt(SLOT).length, 3, "situation signalée : les deux RDV (et un événement perso) sur le même créneau");

  const first = await mods.cron.GET(CRON);
  await waitForLogs();
  assert.equal(mods.google.fake.get(ghost.id).status, "cancelled", "RDV annulé retiré de Google Calendar");
  assert.equal(mods.google.fake.get(f.googleEventId).status, "confirmed", "RDV de Florian intact");
  assert.equal(mods.google.fake.get(perso.id).status, "confirmed", "événement indépendant intact");
  assert.equal((await reload(f.id)).status, "CONFIRMED");
  assert.equal((await reload(m.id)).status, "CANCELLED");
  const log = await env.prisma.syncLog.findFirst({ where: { action: "ghost_event_deleted", recordId: m.id } });
  assert.equal(log?.details?.googleEventId, ghost.id, "suppression journalisée avec l'identifiant exact");

  // Deux synchronisations de plus : aucun doublon, rien ne réapparaît.
  await mods.cron.GET(CRON);
  await mods.cron.GET(CRON);
  await waitForLogs();
  assert.deepEqual(liveAt(SLOT).map((e) => e.id).sort(), [f.googleEventId, perso.id].sort());
  assert.equal((await reload(m.id)).status, "CANCELLED", "le RDV annulé n'est jamais restauré");
  assert.equal(await env.prisma.booking.count(), 2, "aucune réservation créée par la synchro");
  // L'événement perso est importé une seule fois comme bloc.
  assert.equal(await env.prisma.block.count({ where: { googleEventId: perso.id } }), 1);
  assert.equal(await env.prisma.syncLog.count({ where: { action: "ghost_event_deleted" } }), 1, "une seule suppression");
  assert.ok(first.body.success);
});

test("fantôme lié par son identifiant (suppression échouée puis oubliée) : supprimé dès qu'il revient par la synchro", { skip: SKIP }, async () => {
  await resetDb();
  const massimo = await newClient("Massimo Renaud");
  const m = await book(massimo);
  // Ancien comportement : annulation en base, événement resté vivant, puis
  // marqué « synced » par la synchro.
  await env.prisma.booking.update({ where: { id: m.id }, data: { status: "CANCELLED", syncStatus: "synced" } });
  const edited = mods.google.fake.editFromGoogle(m.googleEventId, { description: "modifié" });
  const pulled = await mods.sync.pullFromGoogle(edited, edited.id);
  assert.equal(pulled.action, "ghost_event_deleted");
  assert.equal(mods.google.fake.get(m.googleEventId).status, "cancelled");
  const after = await reload(m.id);
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.syncStatus, "cancelled");
  // L'écho de la suppression revient de Google : aucune écriture, aucune restauration.
  const echo = await mods.sync.pullFromGoogle(null, m.googleEventId);
  assert.equal(echo.action, "already_cancelled");
});

test("annulation venue de Google puis événement rétabli dans Google : la réservation est restaurée, jamais supprimée", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Florian Mairesse");
  const b = await book(client);
  mods.google.fake.deleteFromGoogle(b.googleEventId);
  await mods.sync.pullFromGoogle(null, b.googleEventId);
  assert.equal((await reload(b.id)).status, "CANCELLED");
  // Geoffrey annule sa suppression dans Google.
  const restored = mods.google.fake.editFromGoogle(b.googleEventId, { status: "confirmed" });
  const pulled = await mods.sync.pullFromGoogle(restored, restored.id);
  assert.notEqual(pulled.action, "ghost_event_deleted");
  assert.equal((await reload(b.id)).status, "CONFIRMED");
  assert.equal(mods.google.fake.get(b.googleEventId).status, "confirmed");
});

// ─── Échec Google : jamais déclaré réussi, toujours repris ─────────────────

test("suppression Google en échec : annulation en « error », reprise par le cron, puis plus aucune réapparition", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Massimo Renaud");
  const b = await book(client);
  mods.google.fake.failNext("delete", 1);
  const res = await mods.booking.cancelBooking(b.id);
  assert.equal(res.ok, true, "le client est bien annulé dans l'app");
  let after = await reload(b.id);
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.syncStatus, "error", "échec Google enregistré, pas de faux succès");
  assert.equal(mods.google.fake.get(b.googleEventId).status, "confirmed", "événement encore là");

  await mods.cron.GET(CRON);
  after = await reload(b.id);
  assert.equal(after.syncStatus, "cancelled", "nouvelle tentative réussie");
  assert.equal(mods.google.fake.get(b.googleEventId).status, "cancelled");

  const deletes = () => mods.google.fake.state.calls.filter((c) => c.op === "delete").length;
  const before = deletes();
  await mods.cron.GET(CRON);
  await mods.cron.GET(CRON);
  assert.equal(deletes(), before, "idempotent : plus aucune écriture");
  assert.equal(liveAt(SLOT).length, 0);
  assert.equal((await reload(b.id)).status, "CANCELLED");
});

test("annulation interrompue avant l'appel Google (fonction coupée) : « pending » dans la même écriture, reprise par le cron", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Massimo Renaud");
  const b = await book(client);
  // Panne de la recherche par étiquette : tout le push échoue après la
  // suppression principale ; l'état reste repris par le cron.
  mods.google.fake.failNext("find", 1);
  await mods.booking.cancelBooking(b.id);
  assert.equal((await reload(b.id)).syncStatus, "error");
  // État « coupé net » : annulé en base, jamais poussé.
  const c = await book(await newClient("Autre Client"), "2027-02-05T19:00");
  await env.prisma.booking.update({ where: { id: c.id }, data: { status: "CANCELLED", syncStatus: "pending" } });
  await mods.cron.GET(CRON);
  assert.equal((await reload(b.id)).syncStatus, "cancelled");
  assert.equal((await reload(c.id)).syncStatus, "cancelled");
  assert.equal(mods.google.fake.get(c.googleEventId).status, "cancelled");
  assert.equal(mods.google.fake.liveEvents().length, 0);
});

// ─── Annulation par Geoffrey ───────────────────────────────────────────────

test("annulation par Geoffrey (admin) : statut répercuté, événement supprimé, email envoyé", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Florian Mairesse");
  const b = await book(client);
  const res = await mods.admin.adminCancelBooking(b.id);
  assert.equal(res.ok, true);
  const after = await reload(b.id);
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.syncStatus, "cancelled");
  assert.equal(mods.google.fake.get(b.googleEventId).status, "cancelled");
  assert.ok(mods.emails.sentEmails.some((e) => e.type === "cancelled" && e.bookingId === b.id));
  // Double clic : idempotent, un seul email.
  const again = await mods.admin.adminCancelBooking(b.id);
  assert.equal(again.alreadyCancelled, true);
  assert.equal(mods.emails.sentEmails.filter((e) => e.type === "cancelled").length, 1);
});

// ─── Doublons ──────────────────────────────────────────────────────────────

test("doublon d'un RDV confirmé : le doublon est supprimé, l'événement lié et le RDV sont conservés", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Florian Mairesse");
  const b = await book(client);
  const dup = orphanEventFor(b, "Florian Mairesse");
  // Copie faite à la main par Geoffrey à un AUTRE horaire : pas un doublon.
  const manualCopy = mods.google.fake.addFromGoogle({
    summary: "RDV — Florian Mairesse",
    start: { dateTime: B("2027-02-05T19:00").toISOString() },
    end: { dateTime: plusHour(B("2027-02-05T19:00")).toISOString() },
    extendedProperties: tagOf(b)
  });
  const { items } = await mods.google.fetchChangedEvents(null);
  const sweep = await mods.sync.sweepGhostEvents(items);
  assert.equal(sweep.deleted, 1);
  assert.equal(mods.google.fake.get(dup.id).status, "cancelled");
  assert.equal(mods.google.fake.get(b.googleEventId).status, "confirmed");
  assert.equal(mods.google.fake.get(manualCopy.id).status, "confirmed", "copie manuelle à un autre horaire : jamais supprimée");
  assert.equal((await reload(b.id)).status, "CONFIRMED");
  const again = await mods.sync.sweepGhostEvents((await mods.google.fetchChangedEvents(null)).items);
  assert.equal(again.deleted + again.relinked, 0, "idempotent");
});

test("RDV confirmé dont l'identifiant en base est mort : rattaché à son événement réel au lieu d'être annulé par la réconciliation", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Florian Mairesse");
  const b = await book(client);
  const real = orphanEventFor(b, "Florian Mairesse");
  mods.google.fake.deleteFromGoogle(b.googleEventId); // l'événement enregistré n'existe plus
  await mods.cron.GET(CRON);
  const after = await reload(b.id);
  assert.equal(after.status, "CONFIRMED", "RDV valide conservé");
  assert.equal(after.googleEventId, real.id, "rattaché à l'événement vivant");
  assert.equal(liveAt(SLOT).length, 1);
});

test("garde-fou : au-delà de 25 suppressions d'un coup, rien n'est supprimé et l'anomalie est journalisée", { skip: SKIP }, async () => {
  await resetDb();
  const client = await newClient("Série Test");
  for (let i = 0; i < 26; i++) {
    const start = new Date(B("2027-03-01T10:00").getTime() + i * 24 * 3600e3);
    const event = mods.google.fake.addFromGoogle({ summary: "RDV — Série Test", start: { dateTime: start.toISOString() }, end: { dateTime: plusHour(start).toISOString() } });
    await env.prisma.booking.create({
      data: { clientId: client.id, startAt: start, endAt: plusHour(start), status: "CANCELLED", syncStatus: "cancelled", googleEventId: event.id, updatedAt: new Date() }
    });
  }
  const sweep = await mods.sync.sweepGhostEvents((await mods.google.fetchChangedEvents(null)).items);
  await waitForLogs();
  assert.equal(sweep.aborted, "too_many_deletions");
  assert.equal(sweep.deleted, 0);
  assert.equal(mods.google.fake.liveEvents().length, 26, "rien supprimé");
  assert.equal(await env.prisma.syncLog.count({ where: { action: "ghost_sweep_aborted" } }), 1);
});
