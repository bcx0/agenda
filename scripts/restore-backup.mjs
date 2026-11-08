#!/usr/bin/env node
/**
 * Restauration d'une sauvegarde hors Supabase (.agbk, reçue par email).
 *
 * Usage :
 *   BACKUP_ENCRYPTION_KEY='...' node scripts/restore-backup.mjs agenda-sauvegarde-AAAA-MM-JJ.agbk > restore.sql
 *   BACKUP_ENCRYPTION_KEY='...' node scripts/restore-backup.mjs fichier.agbk --resume
 *
 * Produit un SQL NON destructif (INSERT ... ON CONFLICT (id) DO NOTHING dans
 * une transaction) : une ligne déjà présente n'est jamais écrasée. À exécuter
 * dans Supabase (SQL Editor) ou avec psql sur la base cible. Pour une
 * restauration complète après sinistre : recréer d'abord le schéma (sauvegarde
 * Supabase ou `prisma db push`), puis exécuter ce SQL.
 *
 * Aucune dépendance hors Node.js (testé : tests/backup.test.mjs).
 */
import { readFileSync } from "node:fs";
import { decodeBackup, buildRestoreSql, summarizeBackup } from "../lib/backup-format.mjs";

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error("Usage : node scripts/restore-backup.mjs <fichier.agbk> [--resume]");
  process.exit(1);
}
const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!key) {
  console.error("BACKUP_ENCRYPTION_KEY doit être défini (même valeur que sur Vercel).");
  process.exit(1);
}

const data = decodeBackup(readFileSync(file), key);
if (flag === "--resume") {
  console.log(`Sauvegarde du ${data.exportedAt}`);
  console.table(summarizeBackup(data));
} else {
  process.stdout.write(buildRestoreSql(data));
}
