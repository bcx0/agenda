import { test } from "node:test";
import assert from "node:assert/strict";
import { syncLogPurgePlan, SYSTEM_ACTIONS, INCIDENT_ACTIONS } from "../lib/retention.mjs";

const NOW = Date.parse("2026-11-11T04:17:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("30 jours pour le courant, 90 pour les incidents, 365 pour le système", () => {
  const plan = syncLogPurgePlan(NOW);
  assert.equal(plan.routineBefore.getTime(), NOW - 30 * DAY);
  assert.equal(plan.incidentBefore.getTime(), NOW - 90 * DAY);
  assert.equal(plan.systemBefore.getTime(), NOW - 365 * DAY);
});

test("les actions lues par la maintenance ne sont jamais purgées au bout de 30 jours", () => {
  const plan = syncLogPurgePlan(NOW);
  for (const a of ["backup_sent", "alert_sync_down", "alert_sync_recovered", "alert_storage"]) {
    assert.ok(plan.keptLonger.includes(a), a);
  }
});

test("sync_ok et reconcile_ok restent dans la purge courante (au moins un par jour est recréé)", () => {
  const plan = syncLogPurgePlan(NOW);
  assert.ok(!plan.keptLonger.includes("sync_ok"));
  assert.ok(!plan.keptLonger.includes("reconcile_ok"));
});

test("aucune action n'est à la fois système et incident", () => {
  for (const a of SYSTEM_ACTIONS) assert.ok(!INCIDENT_ACTIONS.includes(a), a);
});

test("la purge des incidents ne vise que les incidents", () => {
  const plan = syncLogPurgePlan(NOW);
  assert.deepEqual(plan.incidentActions, INCIDENT_ACTIONS);
  for (const a of SYSTEM_ACTIONS) assert.ok(!plan.incidentActions.includes(a), a);
});
