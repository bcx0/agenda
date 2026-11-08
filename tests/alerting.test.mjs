/**
 * Tests — lib/alerting.mjs (décisions d'alerte et de sauvegarde).
 * Lancer : node --test tests/alerting.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  decideSyncAlert,
  isBackupDue,
  shouldAlertStorage,
  SYNC_DOWN_THRESHOLD_MS,
  ALERT_REPEAT_MS,
  BACKUP_INTERVAL_MS,
  DB_SIZE_ALERT_BYTES,
} from "../lib/alerting.mjs";

const NOW = Date.UTC(2026, 10, 8, 21, 0, 0);
const MIN = 60 * 1000;

test("sync saine : aucune alerte", () => {
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt: NOW - 5 * MIN, lastAlertAt: null, lastRecoveryAt: null }), null);
});

test("panne de moins de 30 min : pas encore d'alerte (évite les fausses alertes)", () => {
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt: NOW - 25 * MIN, lastAlertAt: null, lastRecoveryAt: null }), null);
});

test("panne de plus de 30 min : alerte, une seule fois", () => {
  const lastOkAt = NOW - SYNC_DOWN_THRESHOLD_MS - MIN;
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt, lastAlertAt: null, lastRecoveryAt: null }), "down");
  assert.equal(decideSyncAlert({ now: NOW + 5 * MIN, lastOkAt, lastAlertAt: NOW, lastRecoveryAt: null }), null);
});

test("panne prolongée : rappel au bout de 12 h", () => {
  const lastOkAt = NOW - 13 * 60 * MIN;
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt, lastAlertAt: NOW - ALERT_REPEAT_MS + MIN, lastRecoveryAt: null }), null);
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt, lastAlertAt: NOW - ALERT_REPEAT_MS, lastRecoveryAt: null }), "down");
});

test("retour à la normale : message de rétablissement, une seule fois", () => {
  const lastAlertAt = NOW - 60 * MIN;
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt: NOW - MIN, lastAlertAt, lastRecoveryAt: null }), "recovered");
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt: NOW - MIN, lastAlertAt, lastRecoveryAt: NOW }), null);
});

test("nouvelle panne après un rétablissement : nouvelle alerte", () => {
  assert.equal(
    decideSyncAlert({ now: NOW, lastOkAt: NOW - 40 * MIN, lastAlertAt: NOW - 30 * 60 * MIN, lastRecoveryAt: NOW - 20 * 60 * MIN }),
    "down"
  );
});

test("aucune sync réussie connue : alerte", () => {
  assert.equal(decideSyncAlert({ now: NOW, lastOkAt: null, lastAlertAt: null, lastRecoveryAt: null }), "down");
});

test("sauvegarde : due au premier passage puis tous les 7 jours", () => {
  assert.equal(isBackupDue({ now: NOW, lastBackupAt: null }), true);
  assert.equal(isBackupDue({ now: NOW, lastBackupAt: NOW - BACKUP_INTERVAL_MS + MIN }), false);
  assert.equal(isBackupDue({ now: NOW, lastBackupAt: NOW - BACKUP_INTERVAL_MS }), true);
});

test("stockage : alerte au-delà du seuil, au plus une fois par semaine", () => {
  assert.equal(shouldAlertStorage({ now: NOW, sizeBytes: 200 * 1024 ** 2, lastStorageAlertAt: null }), false);
  assert.equal(shouldAlertStorage({ now: NOW, sizeBytes: DB_SIZE_ALERT_BYTES, lastStorageAlertAt: null }), true);
  assert.equal(shouldAlertStorage({ now: NOW, sizeBytes: DB_SIZE_ALERT_BYTES, lastStorageAlertAt: NOW - MIN }), false);
});
