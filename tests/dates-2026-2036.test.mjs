/**
 * Tests de dates sur 2026-2036 : changements d'heure Europe et États-Unis
 * (qui ne tombent pas le même jour), années bissextiles, passages de mois et
 * d'année. Vérifie lib/recurring.mjs et la règle de lecture des périodes
 * Belgique (lib/booking.ts, brusselsIsoDate).
 * Lancer : node --test tests/dates-2026-2036.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { recurringBlockOverlapsSlot } from "../lib/recurring.mjs";

const BXL = "Europe/Brussels";
const NY = "America/New_York";

/** Même lecture que lib/booking.ts (brusselsIsoDate). */
const brusselsIsoDate = (date) => DateTime.fromJSDate(date, { zone: "utc" }).setZone(BXL).toISODate();
/** Même écriture que app/admin/actions.ts (création d'une période Belgique). */
const storedPeriod = (startIso, endIso) => ({
  startDate: DateTime.fromISO(startIso, { zone: BXL }).startOf("day").toUTC().toJSDate(),
  endDate: DateTime.fromISO(endIso, { zone: BXL }).endOf("day").toUTC().toJSDate(),
});

test("période Belgique : relue avec ses dates exactes, toutes saisons, 2026-2036", () => {
  // Cas réel de production : période saisie 14/12 → 21/12/2026.
  const real = { startDate: new Date("2026-12-13T23:00:00Z"), endDate: new Date("2026-12-21T22:59:59.999Z") };
  assert.equal(brusselsIsoDate(real.startDate), "2026-12-14");
  assert.equal(brusselsIsoDate(real.endDate), "2026-12-21");
  // Ancienne lecture (UTC) : commençait la veille.
  assert.equal(DateTime.fromJSDate(real.startDate, { zone: "utc" }).toISODate(), "2026-12-13");

  for (let year = 2026; year <= 2036; year++) {
    for (const [s, e] of [
      [`${year}-01-01`, `${year}-01-31`],
      [`${year}-03-25`, `${year}-04-02`], // passage à l'heure d'été
      [`${year}-07-01`, `${year}-07-31`],
      [`${year}-10-20`, `${year}-11-05`], // passage à l'heure d'hiver
      [`${year}-12-20`, `${year + 1}-01-05`], // changement d'année
    ]) {
      const p = storedPeriod(s, e);
      assert.equal(brusselsIsoDate(p.startDate), s, `début ${s}`);
      assert.equal(brusselsIsoDate(p.endDate), e, `fin ${e}`);
    }
  }
  for (const leap of ["2028-02-29", "2032-02-29", "2036-02-29"]) {
    const p = storedPeriod(leap, leap);
    assert.equal(brusselsIsoDate(p.startDate), leap);
    assert.equal(brusselsIsoDate(p.endDate), leap);
  }
});

/** Dates des changements d'heure d'une zone pour une année. */
function dstTransitions(zone, year) {
  const out = [];
  let prev = DateTime.fromObject({ year, month: 1, day: 1 }, { zone }).offset;
  for (let d = DateTime.fromObject({ year, month: 1, day: 2 }, { zone }); d.year === year; d = d.plus({ days: 1 })) {
    if (d.offset !== prev) out.push(d.minus({ days: 1 }).toISODate());
    prev = d.offset;
  }
  return out;
}

test("les changements d'heure Europe/US sont bien décalés chaque année jusqu'en 2036", () => {
  for (let year = 2026; year <= 2036; year++) {
    const eu = dstTransitions(BXL, year);
    const us = dstTransitions(NY, year);
    assert.equal(eu.length, 2, `${year} Europe`);
    assert.equal(us.length, 2, `${year} US`);
    assert.notEqual(eu[0], us[0], `${year} printemps décalé`);
  }
});

test("bloc récurrent Miami : couvre le bon créneau à Bruxelles même pendant le décalage DST", () => {
  // Bloc lundi 09:00-10:00 heure de Miami.
  const block = { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", timeZone: NY };
  for (let year = 2026; year <= 2036; year++) {
    for (let d = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: NY }); d.year === year; d = d.plus({ days: 1 })) {
      if (d.weekday !== 1) continue;
      const startNy = d.set({ hour: 9 });
      const slotStart = startNy.toUTC().toJSDate();
      const slotEnd = startNy.plus({ hours: 1 }).toUTC().toJSDate();
      assert.equal(recurringBlockOverlapsSlot(slotStart, slotEnd, block), true, `${d.toISODate()} 9h Miami doit être bloqué`);
      const before = startNy.minus({ hours: 1 });
      assert.equal(
        recurringBlockOverlapsSlot(before.toUTC().toJSDate(), startNy.toUTC().toJSDate(), block),
        false,
        `${d.toISODate()} 8h Miami ne doit pas être bloqué`
      );
    }
  }
});

test("bloc récurrent Bruxelles : stable autour des changements d'heure et des 29 février", () => {
  const block = { dayOfWeek: 7, startTime: "02:00", endTime: "04:00", timeZone: BXL };
  for (let year = 2026; year <= 2036; year++) {
    for (const iso of dstTransitions(BXL, year)) {
      const day = DateTime.fromISO(iso, { zone: BXL });
      if (day.weekday !== 7) continue;
      const s = day.set({ hour: 3, minute: 0 });
      assert.equal(recurringBlockOverlapsSlot(s.toUTC().toJSDate(), s.plus({ minutes: 30 }).toUTC().toJSDate(), block), true, iso);
    }
  }
  const leapBlock = { dayOfWeek: DateTime.fromISO("2028-02-29").weekday, startTime: "10:00", endTime: "11:00", timeZone: BXL };
  const s = DateTime.fromISO("2028-02-29T10:00", { zone: BXL });
  assert.equal(recurringBlockOverlapsSlot(s.toUTC().toJSDate(), s.plus({ hours: 1 }).toUTC().toJSDate(), leapBlock), true);
});

test("mois de quota (Bruxelles) : une séance du soir à Miami le dernier jour bascule au mois suivant", () => {
  // Cas relevé par l'audit : jeudi 28/02/2030 19:00 Miami = 01/03/2030 01:00 Bruxelles.
  const miami = DateTime.fromISO("2030-02-28T19:00", { zone: NY });
  const brusselsMonth = miami.setZone(BXL).toFormat("yyyy-LL");
  assert.equal(brusselsMonth, "2030-03");
});
