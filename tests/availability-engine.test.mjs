/**
 * Tests du moteur de disponibilité unique (lib/availability-engine.mjs).
 *
 * Pur : aucune base. Couvre la logique de priorité, les exceptions
 * d'occurrence, l'état dérivé des réservations liées, les changements d'heure
 * Belgique / États-Unis et la COHÉRENCE affichage ↔ vérification serveur.
 *
 * Lancer : node --test tests/availability-engine.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  BRUSSELS_TZ,
  MIAMI_TZ,
  checkInterval,
  computeSlots,
  expandSeries,
  findBlockers,
  occurrenceInterval,
  windowsForDate,
  statusFromBlockers,
  existingRangesForBrusselsDate
} from "../lib/availability-engine.mjs";

const HOUR = 60 * 60 * 1000;
const utc = (iso) => new Date(iso);
const brussels = (iso) => DateTime.fromISO(iso, { zone: BRUSSELS_TZ }).toUTC().toJSDate();
const miamiHour = (d) => DateTime.fromJSDate(d, { zone: "utc" }).setZone(MIAMI_TZ).toFormat("HH:mm");
const brusselsHour = (d) => DateTime.fromJSDate(d, { zone: "utc" }).setZone(BRUSSELS_TZ).toFormat("HH:mm");

// Série « All-in » : lundi 21:00-22:00, heure de Bruxelles.
const ALL_IN = { id: 1, dayOfWeek: 1, startTime: "21:00", endTime: "22:00", timeZone: BRUSSELS_TZ, clientId: null, note: "All-in", startDate: null, endDate: null };

// Horaires Miami 09:00-16:00 (heure de Miami) tous les jours = 15:00-22:00 Bruxelles en hiver.
const MIAMI_RULES = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, startTime: "09:00", endTime: "16:00", location: "MIAMI" }));

function ctx(extra = {}) {
  return {
    rules: MIAMI_RULES,
    overrides: [],
    locationPeriods: [],
    recurringBlocks: [ALL_IN],
    exceptions: [],
    seriesBookings: [],
    blocks: [],
    bookings: [],
    ...extra
  };
}

function slot(iso) {
  const start = brussels(iso);
  return [start, new Date(start.getTime() + HOUR)];
}

test("occurrence All-in : 21h Bruxelles = 15h Miami en février", () => {
  const occ = occurrenceInterval(ALL_IN, "2027-02-15");
  assert.equal(occ.startUtc.toISOString(), "2027-02-15T20:00:00.000Z");
  assert.equal(miamiHour(occ.startUtc), "15:00");
  assert.equal(occurrenceInterval(ALL_IN, "2027-02-16"), null, "mardi : pas d'occurrence");
});

test("changements d'heure : la série reste à 21h Bruxelles, Miami suit le décalage", () => {
  // 14/03/2027 : les États-Unis passent à l'heure d'été, l'Europe le 28/03.
  const mar15 = occurrenceInterval(ALL_IN, "2027-03-15");
  assert.equal(brusselsHour(mar15.startUtc), "21:00");
  assert.equal(miamiHour(mar15.startUtc), "16:00", "semaine de décalage US/UE");
  const mar29 = occurrenceInterval(ALL_IN, "2027-03-29");
  assert.equal(brusselsHour(mar29.startUtc), "21:00");
  assert.equal(mar29.startUtc.toISOString(), "2027-03-29T19:00:00.000Z");
  assert.equal(miamiHour(mar29.startUtc), "15:00");
  // 31/10/2027 : l'Europe repasse à l'heure d'hiver, les États-Unis le 07/11.
  const nov1 = occurrenceInterval(ALL_IN, "2027-11-01");
  assert.equal(brusselsHour(nov1.startUtc), "21:00");
  assert.equal(miamiHour(nov1.startUtc), "16:00");
  const nov8 = occurrenceInterval(ALL_IN, "2027-11-08");
  assert.equal(miamiHour(nov8.startUtc), "15:00");
});

test("série en heure de Miami : 15h Miami toute l'année, Bruxelles suit", () => {
  const miamiSeries = { ...ALL_IN, id: 2, startTime: "15:00", endTime: "16:00", timeZone: MIAMI_TZ };
  for (const iso of ["2027-02-15", "2027-03-15", "2027-03-29", "2027-11-01", "2027-11-08"]) {
    const occ = occurrenceInterval(miamiSeries, iso);
    assert.equal(miamiHour(occ.startUtc), "15:00", iso);
  }
  assert.equal(brusselsHour(occurrenceInterval(miamiSeries, "2027-03-15").startUtc), "20:00");
  assert.equal(brusselsHour(occurrenceInterval(miamiSeries, "2027-02-15").startUtc), "21:00");
});

test("bloc récurrent sans exception : bloque chaque lundi 21h", () => {
  const c = ctx();
  for (const iso of ["2027-02-08T21:00", "2027-02-15T21:00", "2027-02-22T21:00", "2027-03-01T21:00"]) {
    const [s, e] = slot(iso);
    const blockers = findBlockers(s, e, c);
    assert.equal(blockers.length, 1, iso);
    assert.equal(blockers[0].kind, "recurring");
    assert.match(blockers[0].label, /21:00-22:00 \(Bruxelles\) — All-in/);
  }
  const [s, e] = slot("2027-02-16T21:00");
  assert.equal(findBlockers(s, e, c).length, 0, "mardi libre");
});

test("exception SKIP : libère UNE date, les autres restent bloquées", () => {
  const c = ctx({ exceptions: [{ id: 1, recurringBlockId: 1, occurrenceDate: "2027-02-08", type: "SKIP" }] });
  assert.equal(findBlockers(...slot("2027-02-08T21:00"), c).length, 0);
  assert.equal(findBlockers(...slot("2027-02-15T21:00"), c).length, 1);
});

test("exception MOVE : ancien créneau libre, nouveau bloqué ; hors période ignorée", () => {
  const move = {
    id: 1,
    recurringBlockId: 1,
    occurrenceDate: "2027-02-15",
    type: "MOVE",
    newStartAt: brussels("2027-02-24T21:00"),
    newEndAt: brussels("2027-02-24T22:00"),
    bookingId: null
  };
  const c = ctx({ exceptions: [move] });
  assert.equal(findBlockers(...slot("2027-02-15T21:00"), c).length, 0, "15/02 libéré");
  const moved = findBlockers(...slot("2027-02-24T21:00"), c);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].movedOccurrence, true);
  const occ = expandSeries(ALL_IN, c, brussels("2027-02-15T00:00"), brussels("2027-02-16T00:00"));
  assert.equal(occ[0].state, "moved");
  // Série bornée avant le 15/02 : la semaine n'existe plus, le déplacement non plus.
  const bounded = ctx({ recurringBlocks: [{ ...ALL_IN, endDate: "2027-02-14" }], exceptions: [move] });
  assert.equal(findBlockers(...slot("2027-02-24T21:00"), bounded).length, 0);
});

test("période de série : rien avant startDate ni après endDate", () => {
  const c = ctx({ recurringBlocks: [{ ...ALL_IN, startDate: "2027-02-15", endDate: "2027-02-22" }] });
  assert.equal(findBlockers(...slot("2027-02-08T21:00"), c).length, 0);
  assert.equal(findBlockers(...slot("2027-02-15T21:00"), c).length, 1);
  assert.equal(findBlockers(...slot("2027-02-22T21:00"), c).length, 1);
  assert.equal(findBlockers(...slot("2027-03-01T21:00"), c).length, 0);
});

test("état dérivé : réservation liée déplacée → créneau d'origine CONSERVÉ en attente de décision ; annulée → libérée", () => {
  const series = { ...ALL_IN, clientId: 7 };
  const movedBooking = {
    id: 10, recurringBlockId: 1, occurrenceDate: "2027-02-15", status: "CONFIRMED",
    startAt: brussels("2027-02-24T21:00"), endAt: brussels("2027-02-24T22:00")
  };
  const cancelled = {
    id: 11, recurringBlockId: 1, occurrenceDate: "2027-02-22", status: "CANCELLED",
    startAt: brussels("2027-02-22T21:00"), endAt: brussels("2027-02-22T22:00")
  };
  const onPlace = {
    id: 12, recurringBlockId: 1, occurrenceDate: "2027-03-01", status: "CONFIRMED",
    startAt: brussels("2027-03-01T21:00"), endAt: brussels("2027-03-01T22:00")
  };
  const c = ctx({
    recurringBlocks: [series],
    seriesBookings: [movedBooking, cancelled, onPlace],
    bookings: [movedBooking, onPlace].map((b) => ({ ...b, clientName: "All-in" }))
  });
  // Décision du 26/11/2026 : le créneau d'origine d'un RDV régulier déplacé
  // reste bloqué tant que l'admin n'a pas choisi (avertissement + bouton).
  const origin = findBlockers(...slot("2027-02-15T21:00"), c);
  assert.equal(origin.length, 1, "ancien créneau du RDV déplacé : toujours bloqué");
  assert.equal(origin[0].kind, "recurring");
  assert.equal(origin[0].pendingDecision, true, "décision attendue");
  const feb15 = expandSeries(series, c, ...slot("2027-02-15T21:00"))[0];
  assert.equal(feb15.state, "active");
  assert.equal(feb15.pendingDecision, true);
  assert.equal(feb15.movedTo.startUtc.getTime(), brussels("2027-02-24T21:00").getTime());
  // « Libérer ce créneau » = exception SKIP : libre, cette date uniquement.
  const released = ctx({ ...c, exceptions: [{ recurringBlockId: 1, occurrenceDate: "2027-02-15", type: "SKIP" }] });
  assert.equal(findBlockers(...slot("2027-02-15T21:00"), released).length, 0, "libéré après le clic");
  // « Garder bloqué » = exception KEEP : bloqué, plus de décision attendue.
  const kept = ctx({ ...c, exceptions: [{ recurringBlockId: 1, occurrenceDate: "2027-02-15", type: "KEEP" }] });
  const keptBlockers = findBlockers(...slot("2027-02-15T21:00"), kept);
  assert.equal(keptBlockers.length, 1);
  assert.equal(keptBlockers[0].pendingDecision, false, "décision prise : plus d'avertissement");
  assert.equal(statusFromBlockers(findBlockers(...slot("2027-02-24T21:00"), c)), "booked", "nouveau créneau : réservé");
  assert.equal(findBlockers(...slot("2027-02-22T21:00"), c).length, 0, "occurrence annulée : libre");
  const onPlaceBlockers = findBlockers(...slot("2027-03-01T21:00"), c);
  assert.equal(statusFromBlockers(onPlaceBlockers), "booked");
  assert.equal(onPlaceBlockers.filter((b) => b.kind === "recurring").length, 0, "pas de double blocage");
  assert.equal(findBlockers(...slot("2027-03-08T21:00"), c).length, 1, "semaine sans RDV lié : la série bloque");
});

test("priorité : réservation > indisponibilité explicite > récurrence", () => {
  const [s, e] = slot("2027-02-15T21:00");
  const c = ctx({
    bookings: [{ id: 1, startAt: s, endAt: e, clientName: "Jean" }],
    overrides: [{ id: 5, type: "BLOCK", date: brussels("2027-02-15T00:00"), startTime: "20:00", endTime: "23:00", note: "Dentiste" }],
    blocks: [{ id: 9, startAt: s, endAt: e, reason: "Perso", syncSource: "google", googleEventId: "g1" }]
  });
  const blockers = findBlockers(s, e, c);
  assert.deepEqual(blockers.map((b) => b.kind), ["booking", "manual_block", "calendar_block", "recurring"]);
  assert.equal(statusFromBlockers(blockers), "booked");
  assert.equal(statusFromBlockers(blockers.slice(1)), "blocked");
  assert.equal(statusFromBlockers([]), "available");
  assert.equal(checkInterval(s, e, c).code, "TAKEN");
  assert.equal(checkInterval(s, e, c, { excludeBookingId: 1 }).code, "BLOCKED");
});

test("fenêtres : ouverture du jour (OPEN) remplace les horaires, période Belgique", () => {
  const c = ctx({
    overrides: [{ id: 1, type: "OPEN", date: brussels("2027-02-17T00:00"), startTime: "08:00", endTime: "10:00" }],
    locationPeriods: [{ startDate: brussels("2027-02-20T00:00"), endDate: brussels("2027-02-21T23:59") }],
    rules: [...MIAMI_RULES, { dayOfWeek: 6, startTime: "10:00", endTime: "12:00", location: "BELGIUM" }]
  });
  const open = windowsForDate("2027-02-17", c);
  assert.equal(open.length, 1);
  assert.equal(open[0].source, "override");
  assert.equal(brusselsHour(open[0].startUtc), "08:00");
  const belgium = windowsForDate("2027-02-20", c);
  assert.equal(belgium[0].location, "BELGIUM");
  assert.equal(brusselsHour(belgium[0].startUtc), "10:00");
  assert.equal(windowsForDate("2027-02-21", c).length, 0, "dimanche sans horaire Belgique");
  const miami = windowsForDate("2027-02-18", c);
  assert.equal(miamiHour(miami[0].startUtc), "09:00");
});

test("cohérence : tout créneau affiché « disponible » est accepté par le serveur, et inversement", () => {
  const [s15, e15] = slot("2027-02-15T21:00");
  const c = ctx({
    recurringBlocks: [ALL_IN, { ...ALL_IN, id: 2, dayOfWeek: 3, startTime: "16:00", endTime: "17:00", timeZone: MIAMI_TZ }],
    exceptions: [{ id: 1, recurringBlockId: 1, occurrenceDate: "2027-03-01", type: "SKIP" }],
    bookings: [{ id: 1, startAt: s15, endAt: e15, clientName: "X" }],
    overrides: [
      { id: 2, type: "BLOCK", date: brussels("2027-02-18T00:00"), startTime: "17:00", endTime: "19:00" },
      { id: 3, type: "OPEN", date: brussels("2027-03-06T00:00"), startTime: "06:00", endTime: "09:00" }
    ],
    blocks: [{ id: 4, startAt: brussels("2027-02-19T16:30"), endAt: brussels("2027-02-19T17:30"), syncSource: "google" }],
    locationPeriods: [{ startDate: brussels("2027-03-20T00:00"), endDate: brussels("2027-04-05T23:59") }],
    rules: [...MIAMI_RULES, { dayOfWeek: 1, startTime: "18:00", endTime: "23:00", location: "BELGIUM" }]
  });
  const slots = computeSlots(c, { startDateIso: "2027-02-10", days: 80 });
  assert.ok(slots.length > 300);
  let available = 0;
  for (const sl of slots) {
    const check = checkInterval(sl.start, sl.end, c);
    if (sl.status === "available") {
      available++;
      assert.equal(check.ok, true, `${sl.start.toISOString()} affiché libre mais refusé (${check.error})`);
    } else {
      assert.equal(check.ok, false, `${sl.start.toISOString()} affiché ${sl.status} mais accepté`);
    }
  }
  assert.ok(available > 100);
  // Changements d'heure : aucun créneau dupliqué ni manquant sur la semaine US/UE décalée.
  const keys = new Set(slots.map((sl) => sl.start.toISOString()));
  assert.equal(keys.size, slots.length);
});

test("plages existantes du jour : base de fusion de « Ajouter un créneau »", () => {
  const c = ctx();
  const ranges = existingRangesForBrusselsDate("2027-02-15", c);
  assert.ok(ranges.some((r) => r.startTime === "21:00" && r.endTime === "22:00"));
  assert.ok(ranges.some((r) => r.startTime === "15:00"));
});
