/**
 * Tests — sauvegarde chiffrée et restauration (lib/backup-format.mjs).
 *
 * Partie 1 (toujours) : chiffrement, intégrité, mauvaise clé, fichier altéré.
 * Partie 2 (si un PostgreSQL de test est fourni) : restauration réelle dans
 * une base vierge, comparaison ligne à ligne, ré-exécution sans écrasement,
 * volume de 5 000 RDV répartis de 2026 à 2036 (années bissextiles et
 * changements d'heure inclus).
 *
 *   node --test tests/backup.test.mjs
 *   TEST_PG="host=/chemin/socket port=54329 user=postgres" node --test tests/backup.test.mjs
 *
 * La base de test est DÉTRUITE et recréée : ne jamais pointer TEST_PG vers
 * une base réelle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  encodeBackup,
  decodeBackup,
  buildRestoreSql,
  summarizeBackup,
  BACKUP_TABLES,
} from "../lib/backup-format.mjs";

const KEY = "cle-de-test-suffisamment-longue";
const SCHEMA = readFileSync(fileURLToPath(new URL("./fixtures/backup-schema.sql", import.meta.url)), "utf8");

function sampleData() {
  return {
    exportedAt: "2026-11-08T21:30:00.000Z",
    tables: {
      Client: [
        { id: 1, email: "o'brien@example.com", name: "Éloïse O'Brien — test ✓", passwordHash: "$2a$10$abc", creditsPerMonth: 4, isActive: true, createdAt: "2026-01-24T11:12:24.000Z" },
        { id: 7, email: "b@example.com", name: "Bernard", passwordHash: "$2a$10$def", creditsPerMonth: 8, isActive: false, createdAt: "2026-02-01T00:00:00.000Z" },
      ],
      Settings: [
        { id: 1, location: "BELGIQUE", presentielLocation: "Vander Valk", presentielNote: null, defaultMode: "VISIO", updatedAt: "2026-10-01T08:00:00.000Z", bookingLocked: false },
      ],
      AvailabilityOverride: [
        { id: 3, date: "2028-02-29T00:00:00.000Z", startTime: "09:00", endTime: "12:00", type: "BLOCK", note: "29 février", createdAt: "2026-03-01T00:00:00.000Z" },
      ],
      RecurringBlock: [
        { id: 24, dayOfWeek: 1, startTime: "22:00", endTime: "23:00", clientId: 7, note: null, createdAt: "2026-03-31T17:37:00.000Z", timeZone: "America/New_York" },
      ],
      Booking: [
        { id: 53615, clientId: 1, startAt: "2026-03-29T00:30:00.000Z", endAt: "2026-03-29T01:30:00.000Z", status: "CONFIRMED", mode: "VISIO", createdAt: "2026-03-01T10:00:00.000Z", manageToken: "tok1", updatedAt: "2026-03-01T10:00:00.000Z", manageTokenExpiresAt: null, cancelReason: null, rescheduleReason: null, timeZone: "Europe/Brussels", googleEventId: "_abc_20260329T003000Z", googleEtag: '"3456"', syncStatus: "synced", syncSource: "google", lastSyncedAt: "2026-03-01T10:00:01.000Z", booked_by: "google" },
        { id: 53616, clientId: 7, startAt: "2026-10-25T00:30:00.000Z", endAt: "2026-10-25T01:30:00.000Z", status: "CANCELLED", mode: "PRESENTIEL", createdAt: "2026-10-01T10:00:00.000Z", manageToken: null, updatedAt: "2026-10-02T10:00:00.000Z", manageTokenExpiresAt: null, cancelReason: "Empêchement ; l'élève l'a dit", rescheduleReason: null, timeZone: "America/New_York", googleEventId: null, googleEtag: null, syncStatus: "cancelled", syncSource: "app", lastSyncedAt: null, booked_by: "client" },
      ],
    },
  };
}

test("chiffrement : aller-retour fidèle, contenu illisible sans la clé", () => {
  const data = sampleData();
  const file = encodeBackup(data, KEY);
  assert.equal(file.subarray(0, 5).toString("ascii"), "AGBK1");
  assert.ok(!file.toString("latin1").includes("o'brien@example.com"), "les données ne doivent pas apparaître en clair");
  const back = decodeBackup(file, KEY);
  assert.deepEqual(back.tables, data.tables);
  assert.equal(back.version, 1);
  assert.deepEqual(summarizeBackup(back), Object.fromEntries(BACKUP_TABLES.map((t) => [t, (data.tables[t] ?? []).length])));
});

test("chiffrement : mauvaise clé, fichier altéré ou tronqué refusés", () => {
  const file = encodeBackup(sampleData(), KEY);
  assert.throws(() => decodeBackup(file, "une-autre-cle-de-test-longue"), /mauvaise clé ou fichier altéré/);
  const tampered = Buffer.from(file);
  tampered[tampered.length - 5] ^= 0xff;
  assert.throws(() => decodeBackup(tampered, KEY), /mauvaise clé ou fichier altéré/);
  assert.throws(() => decodeBackup(file.subarray(0, 20), KEY), /trop court/);
  assert.throws(() => encodeBackup(sampleData(), "court"), /trop courte/);
});

test("SQL de restauration : guillemets échappés, identifiants contrôlés", () => {
  const sql = buildRestoreSql(sampleData());
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\n$/);
  assert.ok(sql.includes("'o''brien@example.com'"));
  assert.ok(sql.includes('ON CONFLICT ("id") DO NOTHING'));
  assert.ok(!sql.includes("pg_get_serial_sequence('\"Settings\"'"), "Settings n'a pas de séquence");
  assert.throws(() => buildRestoreSql({ tables: { Client: [{ 'id"; DROP TABLE x; --': 1 }] } }), /Identifiant SQL invalide/);
});

// ─── Partie 2 : restauration réelle ────────────────────────────────────
const PG = process.env.TEST_PG;

function psql(db, sql) {
  return execFileSync("psql", [`${PG} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}
function psqlFile(db, sql) {
  return execFileSync("psql", [`${PG} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", "-"], { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}
function freshDb(name) {
  psql("postgres", `DROP DATABASE IF EXISTS ${name}`);
  psql("postgres", `CREATE DATABASE ${name}`);
  psqlFile(name, SCHEMA);
}
/** Lecture d'une table comme le fait l'export ($queryRawUnsafe, dates en ISO UTC). */
function readTable(db, table) {
  const out = psql(db, `SELECT COALESCE(json_agg(t ORDER BY t."id"), '[]') FROM "${table}" t`);
  return JSON.parse(out).map((row) => {
    const copy = { ...row };
    for (const [k, v] of Object.entries(copy)) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v)) copy[k] = new Date(v + "Z").toISOString();
    }
    return copy;
  });
}
function snapshot(db) {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, readTable(db, t)]));
}

test("restauration réelle dans une base vierge, puis ré-exécution sans écrasement", { skip: !PG && "TEST_PG non défini" }, () => {
  freshDb("agbk_src");
  psqlFile("agbk_src", buildRestoreSql(sampleData()));

  // Volume : 5 000 RDV de 2026 à 2036, pas de 18 h (traverse DST et 29/02).
  const values = [];
  const start = Date.UTC(2026, 0, 1, 8, 0, 0);
  for (let i = 0; i < 5000; i++) {
    const s = new Date(start + i * 18 * 3600 * 1000);
    const e = new Date(s.getTime() + 3600 * 1000);
    values.push(`(${i % 2 === 0 ? 1 : 7}, '${s.toISOString()}', '${e.toISOString()}', '${s.toISOString()}', '${i % 3 === 0 ? "Europe/Brussels" : "America/New_York"}')`);
  }
  psqlFile("agbk_src", `INSERT INTO "Booking" ("clientId","startAt","endAt","updatedAt","timeZone") VALUES ${values.join(",")};`);
  assert.equal(psql("agbk_src", `SELECT count(*) FROM "Booking" WHERE "startAt" >= '2036-01-01'`).trim() !== "0", true, "le jeu doit couvrir 2036");
  assert.equal(psql("agbk_src", `SELECT count(*) FROM "Booking" WHERE "startAt"::date = '2028-02-29'`).trim() !== "0" || psql("agbk_src", `SELECT count(*) FROM "Booking" WHERE "startAt"::date BETWEEN '2028-02-28' AND '2028-03-01'`).trim() !== "0", true);

  // Export (forme identique à lib/backup.ts) → fichier chiffré → restauration.
  const exported = { exportedAt: new Date().toISOString(), tables: snapshot("agbk_src") };
  const file = encodeBackup(exported, KEY);
  assert.ok(file.length < 2 * 1024 * 1024, `sauvegarde compacte (${file.length} octets)`);
  const sql = buildRestoreSql(decodeBackup(file, KEY));

  freshDb("agbk_dst");
  psqlFile("agbk_dst", sql);
  assert.deepEqual(snapshot("agbk_dst"), snapshot("agbk_src"), "la base restaurée doit être identique");

  // Les séquences sont recalées : une nouvelle ligne ne heurte pas un id restauré.
  const newId = Number(psql("agbk_dst", `INSERT INTO "Booking" ("clientId","startAt","endAt","updatedAt") VALUES (1, now(), now(), now()) RETURNING "id"`).trim());
  const maxRestored = Math.max(...exported.tables.Booking.map((b) => b.id));
  assert.ok(newId > maxRestored, `id ${newId} > ${maxRestored}`);

  // Ré-exécution : aucune erreur, aucun doublon, une ligne modifiée n'est pas écrasée.
  psql("agbk_dst", `UPDATE "Client" SET "name" = 'Modifié après restauration' WHERE "id" = 7`);
  psqlFile("agbk_dst", sql);
  assert.equal(psql("agbk_dst", `SELECT count(*) FROM "Booking"`).trim(), String(exported.tables.Booking.length + 1));
  assert.equal(psql("agbk_dst", `SELECT "name" FROM "Client" WHERE "id" = 7`).trim(), "Modifié après restauration");

  psql("postgres", "DROP DATABASE agbk_src");
  psql("postgres", "DROP DATABASE agbk_dst");
});
