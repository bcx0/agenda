/**
 * Format des sauvegardes hors Supabase : logique pure (sans Prisma),
 * partagée par l'app (lib/backup.ts), le script de restauration
 * (scripts/restore-backup.mjs) et les tests (tests/backup.test.mjs).
 *
 * Fichier .agbk = "AGBK1" + sel(16) + iv(12) + tag(16) + AES-256-GCM(gzip(JSON)).
 * Clé dérivée de BACKUP_ENCRYPTION_KEY par scrypt. Sans la clé, le fichier
 * est illisible : il contient des empreintes de mots de passe clients et les
 * jetons des liens « gérer mon RDV ».
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

export const BACKUP_FORMAT_VERSION = 1;
const MAGIC = Buffer.from("AGBK1", "ascii");

/**
 * Tables sauvegardées, dans l'ordre de restauration (parents avant enfants).
 * Exclues volontairement : GoogleToken (secrets OAuth), GoogleCalendarWatch
 * (canal technique recréé automatiquement), SyncLog et EmailLog (journaux).
 */
export const BACKUP_TABLES = [
  "Client",
  "Settings",
  "session_modes",
  "Admin",
  "AvailabilityRule",
  "LocationPeriod",
  "AvailabilityOverride",
  "RecurringBlock",
  "Block",
  "Booking",
  "Prospect",
];

/** Tables dont la clé primaire "id" est un entier auto-incrémenté. */
const SERIAL_ID_TABLES = new Set(BACKUP_TABLES.filter((t) => t !== "Settings"));

function deriveKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 16) {
    throw new Error("BACKUP_ENCRYPTION_KEY absente ou trop courte (16 caractères minimum)");
  }
  return scryptSync(passphrase, salt, 32);
}

/** JSON.stringify qui supporte BigInt et Date. */
export function toJson(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 * @param {{ exportedAt: string, tables: Record<string, Array<Record<string, unknown>>> }} data
 * @param {string} passphrase
 * @returns {Buffer}
 */
export function encodeBackup(data, passphrase) {
  const payload = gzipSync(Buffer.from(toJson({ version: BACKUP_FORMAT_VERSION, ...data }), "utf8"));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}

/**
 * @param {Buffer} buffer
 * @param {string} passphrase
 */
export function decodeBackup(buffer, passphrase) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MAGIC.length + 44) {
    throw new Error("Fichier de sauvegarde invalide (trop court)");
  }
  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Fichier de sauvegarde invalide (signature AGBK1 absente)");
  }
  let offset = MAGIC.length;
  const salt = buffer.subarray(offset, (offset += 16));
  const iv = buffer.subarray(offset, (offset += 12));
  const tag = buffer.subarray(offset, (offset += 16));
  const encrypted = buffer.subarray(offset);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  let plain;
  try {
    plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error("Déchiffrement impossible : mauvaise clé ou fichier altéré");
  }
  const data = JSON.parse(gunzipSync(plain).toString("utf8"));
  if (data?.version !== BACKUP_FORMAT_VERSION || typeof data.tables !== "object") {
    throw new Error(`Version de sauvegarde non supportée (${data?.version})`);
  }
  return data;
}

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Identifiant SQL invalide : ${name}`);
  return `"${name}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Nombre non fini : ${value}`);
    return String(value);
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * SQL de restauration NON destructif : INSERT ... ON CONFLICT (id) DO NOTHING
 * (une ligne déjà présente n'est jamais écrasée), puis recalage des séquences.
 * Le tout dans une transaction.
 *
 * @param {{ tables: Record<string, Array<Record<string, unknown>>> }} data
 * @returns {string}
 */
export function buildRestoreSql(data) {
  const out = ["BEGIN;"];
  for (const table of BACKUP_TABLES) {
    const rows = data.tables[table] ?? [];
    if (rows.length === 0) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      out.push(
        `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${cols
          .map((c) => sqlLiteral(row[c]))
          .join(", ")}) ON CONFLICT ("id") DO NOTHING;`
      );
    }
    if (SERIAL_ID_TABLES.has(table)) {
      out.push(
        `SELECT setval(pg_get_serial_sequence('${quoteIdent(table)}', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM ${quoteIdent(
          table
        )}), 1));`
      );
    }
  }
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}

/** Nombre de lignes par table, pour le résumé de l'email et la vérification. */
export function summarizeBackup(data) {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, (data.tables[t] ?? []).length]));
}
