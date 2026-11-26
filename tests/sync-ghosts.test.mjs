/**
 * Événements fantômes et doublons dans Google Calendar (26/11/2026) :
 * tests du planificateur pur lib/sync-ghosts.mjs (aucune base, aucun réseau).
 *
 * Lancer : node --test tests/sync-ghosts.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  GHOST_SWEEP_MAX_ACTIONS,
  eventOwnership,
  isAppCancelled,
  isWithinGhostScope,
  planGhostSweep
} from "../lib/sync-ghosts.mjs";

const APP = "your-saas-app";
const NOW = new Date("2026-11-26T16:00:00.000Z");
const SLOT = "2026-11-27T18:00:00.000Z"; // vendredi 27/11, 19h Bruxelles = 13h Miami
const tag = (id) => ({ private: { appSource: APP, recordType: "booking", recordId: String(id) } });
const event = (id, extra = {}) => ({
  id,
  status: "confirmed",
  etag: `"${id}"`,
  summary: "RDV",
  created: "2026-11-20T10:00:05.000Z",
  start: { dateTime: SLOT },
  end: { dateTime: "2026-11-27T19:00:00.000Z" },
  ...extra
});
const booking = (id, extra = {}) => ({
  id,
  status: "CONFIRMED",
  cancelReason: null,
  googleEventId: null,
  createdAt: new Date("2026-11-20T10:00:00.000Z"),
  startAt: new Date(SLOT),
  ...extra
});
const plan = (events, bookings, extra = {}) => planGhostSweep({ events, bookings, appSource: APP, now: NOW, ...extra });

test("annulation faite dans l'app ≠ annulation venue de Google", () => {
  assert.equal(isAppCancelled(booking(1, { status: "CANCELLED" })), true);
  assert.equal(isAppCancelled(booking(1, { status: "CANCELLED", cancelReason: "Annulé par le client" })), true);
  assert.equal(isAppCancelled(booking(1, { status: "CANCELLED", cancelReason: "Supprimé depuis Google Calendar" })), false);
  assert.equal(isAppCancelled(booking(1, { status: "CANCELLED", cancelReason: "Supprimé de Google Calendar (réconciliation)" })), false);
  assert.equal(isAppCancelled(booking(1)), false);
});

test("appartenance : identifiant exact, ou étiquette confirmée par la date de création ET l'horaire", () => {
  const b = booking(7, { googleEventId: "evtA" });
  assert.equal(eventOwnership(b, event("evtA"), APP), "linked");
  assert.equal(eventOwnership(b, event("evtB", { extendedProperties: tag(7) }), APP), "tagged");
  // Même horaire mais AUCUN identifiant : jamais désigné par l'horaire seul.
  assert.equal(eventOwnership(b, event("evtC"), APP), null);
  // Étiquette d'une autre réservation.
  assert.equal(eventOwnership(b, event("evtD", { extendedProperties: tag(8) }), APP), null);
  // Étiquette d'une ancienne base : événement créé AVANT la réservation.
  assert.equal(eventOwnership(b, event("evtE", { extendedProperties: tag(7), created: "2026-01-01T00:00:00.000Z" }), APP), null);
  // Copie faite à la main dans Google à un autre horaire.
  assert.equal(
    eventOwnership(b, event("evtF", { extendedProperties: tag(7), start: { dateTime: "2026-11-28T18:00:00.000Z" } }), APP),
    null
  );
  // Étiquette d'une autre application.
  assert.equal(
    eventOwnership(b, event("evtG", { extendedProperties: { private: { appSource: "autre", recordType: "booking", recordId: "7" } } }), APP),
    null
  );
  // Sans date de création, pas de certitude.
  assert.equal(eventOwnership(b, event("evtH", { extendedProperties: tag(7), created: undefined }), APP), null);
});

test("cas signalé : RDV annulé encore dans Google à côté du RDV valide d'un autre client sur le même créneau", () => {
  const massimo = booking(101, { status: "CANCELLED", cancelReason: null });
  const florian = booking(102, { googleEventId: "evtFlorian", createdAt: new Date("2026-11-22T09:00:00.000Z") });
  const result = plan(
    [
      event("evtMassimo", { summary: "RDV — Massimo Renaud", extendedProperties: tag(101) }),
      event("evtFlorian", { summary: "RDV — Florian Mairesse", extendedProperties: tag(102), created: "2026-11-22T09:00:03.000Z" }),
      event("evtPerso", { summary: "Dentiste" })
    ],
    [massimo, florian]
  );
  assert.deepEqual(result.deletions.map((d) => [d.eventId, d.bookingId]), [["evtMassimo", 101]]);
  assert.equal(result.deletions[0].reason, "cancelled_booking_unlinked_event");
  assert.equal(result.relinks.length, 0);
  assert.equal(result.aborted, null);
});

test("événement lié par son identifiant à une réservation annulée dans l'app : supprimé ; annulée par Google : jamais", () => {
  const result = plan(
    [event("evt1"), event("evt2")],
    [
      booking(1, { status: "CANCELLED", googleEventId: "evt1" }),
      booking(2, { status: "CANCELLED", googleEventId: "evt2", cancelReason: "Supprimé depuis Google Calendar" })
    ]
  );
  assert.deepEqual(result.deletions.map((d) => [d.eventId, d.reason]), [["evt1", "cancelled_booking"]]);
});

test("doublon d'une réservation confirmée : seul le doublon est supprimé, l'événement lié est gardé", () => {
  const result = plan(
    [event("evtCanon", { extendedProperties: tag(5) }), event("evtDup", { extendedProperties: tag(5) })],
    [booking(5, { googleEventId: "evtCanon" })]
  );
  assert.deepEqual(result.deletions.map((d) => [d.eventId, d.reason]), [["evtDup", "duplicate_event"]]);
});

test("réservation confirmée sans identifiant (ou identifiant mort) : rattachée, les suivants sont des doublons", () => {
  const noId = plan(
    [event("evtA", { extendedProperties: tag(5) }), event("evtB", { extendedProperties: tag(5) })],
    [booking(5)]
  );
  assert.deepEqual(noId.relinks.map((r) => [r.bookingId, r.eventId]), [[5, "evtA"]]);
  assert.deepEqual(noId.deletions.map((d) => d.eventId), ["evtB"]);
  const deadId = plan([event("evtA", { extendedProperties: tag(5) })], [booking(5, { googleEventId: "evtMort" })]);
  assert.deepEqual(deadId.relinks.map((r) => r.eventId), ["evtA"]);
  assert.equal(deadId.deletions.length, 0);
});

test("RDV annulé par la synchro alors qu'un événement certain de la même réservation vit encore : restauré sur cet événement", () => {
  const cancelledByGoogle = booking(5, { status: "CANCELLED", cancelReason: "Supprimé depuis Google Calendar", googleEventId: "evtMort" });
  const result = plan([event("evtVivant", { extendedProperties: tag(5) })], [cancelledByGoogle]);
  assert.deepEqual(result.relinks, [{ bookingId: 5, eventId: "evtVivant", etag: '"evtVivant"', restore: true }]);
  assert.equal(result.deletions.length, 0);
  // Événement enregistré encore vivant : la restauration passe par la synchro normale.
  const alive = plan(
    [event("evtMort"), event("evtVivant", { extendedProperties: tag(5) })],
    [cancelledByGoogle]
  );
  assert.equal(alive.relinks.length + alive.deletions.length, 0);
});

test("jamais touchés : événement indépendant, bloc, réservation purgée, passé de plus de 24 h, événement déjà annulé", () => {
  const result = plan(
    [
      event("perso"),
      event("bloc", { extendedProperties: tag(1) }),
      event("purge", { extendedProperties: tag(999) }),
      event("vieux", { start: { dateTime: "2026-11-20T18:00:00.000Z" } }),
      event("dejaAnnule", { status: "cancelled" }),
      event("journee", { start: { date: "2026-11-27" } })
    ],
    [
      booking(1, { status: "CANCELLED" }),
      booking(2, { status: "CANCELLED", googleEventId: "vieux" }),
      booking(3, { status: "CANCELLED", googleEventId: "dejaAnnule" }),
      booking(4, { status: "CANCELLED", googleEventId: "journee" })
    ],
    { blockEventIds: ["bloc"] }
  );
  assert.equal(result.deletions.length, 0);
  assert.equal(result.relinks.length, 0);
  assert.equal(isWithinGhostScope(event("x", { start: { dateTime: "2026-11-26T10:00:00.000Z" } }), NOW), true, "passé de moins de 24 h : encore traité");
});

test("étiquette sans certitude sur une réservation annulée : signalée, pas supprimée", () => {
  const result = plan(
    [event("copie", { extendedProperties: tag(9), start: { dateTime: "2026-11-30T18:00:00.000Z" } })],
    [booking(9, { status: "CANCELLED" })]
  );
  assert.equal(result.deletions.length, 0);
  assert.deepEqual(result.uncertain.map((u) => u.eventId), ["copie"]);
});

test("garde-fou : au-delà du plafond, rien n'est appliqué", () => {
  const events = [];
  const bookings = [];
  for (let i = 1; i <= GHOST_SWEEP_MAX_ACTIONS + 1; i++) {
    events.push(event(`evt${i}`));
    bookings.push(booking(i, { status: "CANCELLED", googleEventId: `evt${i}` }));
  }
  assert.equal(plan(events, bookings).aborted, "too_many_deletions");
  assert.equal(plan(events.slice(1), bookings.slice(1)).aborted, null);
});

test("idempotent : une fois les suppressions faites, le plan est vide", () => {
  const bookings = [booking(101, { status: "CANCELLED" }), booking(102, { googleEventId: "evtFlorian" })];
  const events = [event("evtMassimo", { extendedProperties: tag(101) }), event("evtFlorian", { extendedProperties: tag(102) })];
  const first = plan(events, bookings);
  const remaining = events.map((e) => (first.deletions.some((d) => d.eventId === e.id) ? { ...e, status: "cancelled" } : e));
  const second = plan(remaining, bookings);
  assert.equal(second.deletions.length + second.relinks.length, 0);
});
