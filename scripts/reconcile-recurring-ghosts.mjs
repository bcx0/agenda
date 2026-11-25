#!/usr/bin/env node
/**
 * Réconciliation sécurisée des blocages fantômes des RDV réguliers.
 *
 * PAR DÉFAUT : LECTURE SEULE (transaction READ ONLY), aucun changement.
 * Pré-requis : migration prisma/migrations/20261125120000_recurring_occurrence_exceptions
 * appliquée, et DATABASE_URL (variable d'environnement ou fichier .env).
 *
 *   node scripts/reconcile-recurring-ghosts.mjs
 *       Rapport : séries, fantômes prouvés, probables, occurrences sans RDV,
 *       ouvertures « Ajouter un créneau » restées sans effet.
 *   node scripts/reconcile-recurring-ghosts.mjs --json rapport.json
 *       Idem + export JSON.
 *   node scripts/reconcile-recurring-ghosts.mjs --apply-verified
 *       Lie aux occurrences les réservations ANNULÉES à l'horaire exact
 *       (annulation prouvée) → ces créneaux redeviennent libres.
 *   node scripts/reconcile-recurring-ghosts.mjs --link <serie>:<date>:<reservation> [...]
 *       Lie une réservation déplacée à son occurrence d'origine (cas
 *       « probable » validé par l'admin) → l'ancien créneau est libéré.
 *   node scripts/reconcile-recurring-ghosts.mjs --release <serie>:<date> [...]
 *       Libère une occurrence précise (exception SKIP).
 *
 * Aucune suppression : seulement des liens (remettre recurringBlockId et
 * occurrenceDate à NULL pour annuler) ou des exceptions (supprimer la ligne
 * RecurringBlockException pour annuler). Chaque lien est journalisé dans
 * SyncLog (action reconcile_recurring_link).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { analyzeRecurringGhosts, applyOccurrenceLinks, applyOccurrenceReleases } from "../lib/recurring-reconcile.mjs";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const values = (name) => {
  const out = [];
  args.forEach((a, i) => {
    if (a === name) {
      for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) out.push(args[j]);
    }
  });
  return out;
};

if (!process.env.DATABASE_URL && existsSync(".env")) {
  const match = readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m);
  if (match) process.env.DATABASE_URL = match[1];
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant (variable d'environnement ou .env).");
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

function fmt(d) {
  return new Date(d).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", dateStyle: "full", timeStyle: "short" });
}

try {
  const tableCheck = await db.$queryRawUnsafe(
    `SELECT to_regclass('public."RecurringBlockException"')::text AS t`
  );
  if (!tableCheck?.[0]?.t) {
    console.error("La migration 20261125120000_recurring_occurrence_exceptions n'est pas appliquée : rien à faire.");
    process.exit(2);
  }

  const findings = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return analyzeRecurringGhosts(tx);
  });

  console.log("\n=== Séries récurrentes ===");
  for (const s of findings.series) {
    console.log(
      `#${s.id} ${s.label}${s.clientName ? ` · client ${s.clientName}` : " · sans client"} · période ${s.startDate ?? "∞"} → ${s.endDate ?? "∞"} · à venir : ${s.activeOccurrences} bloquées, ${s.bookedOccurrences} réservées, ${s.releasedOccurrences} libérées/déplacées`
    );
  }
  console.log(`\n=== Fantômes PROUVÉS (appliqués avec --apply-verified) : ${findings.verified.length} ===`);
  for (const f of findings.verified) {
    console.log(`série #${f.recurringBlockId} ${f.occurrenceDate} (${fmt(f.startUtc)}) ← réservation annulée #${f.bookingId}`);
  }
  console.log(`\n=== Fantômes PROBABLES (à valider, --link) : ${findings.probable.length} ===`);
  for (const f of findings.probable) {
    console.log(
      `série #${f.recurringBlockId} ${f.occurrenceDate} (${fmt(f.startUtc)}) ← réservation #${f.bookingId} au ${fmt(f.bookingStartUtc)}  →  --link ${f.recurringBlockId}:${f.occurrenceDate}:${f.bookingId}`
    );
  }
  console.log(`\n=== Occurrences bloquées sans aucun RDV (info) : ${findings.noBooking.length} ===`);
  for (const f of findings.noBooking.slice(0, 60)) {
    console.log(`série #${f.recurringBlockId} ${f.occurrenceDate} (${fmt(f.startUtc)})${f.candidates.length ? ` · candidats ambigus : ${f.candidates.join(", ")}` : ""}`);
  }
  console.log(`\n=== « Ajouter un créneau » restés sans effet (bloc récurrent) : ${findings.ineffectiveOpenings.length} ===`);
  for (const f of findings.ineffectiveOpenings) {
    console.log(`${f.date} ${f.range} · ${f.seriesLabel}  →  --release ${f.recurringBlockId}:${f.occurrenceDate}`);
  }

  const jsonPath = values("--json")[0];
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(findings, null, 2));
    console.log(`\nRapport JSON : ${jsonPath}`);
  }

  const links = [];
  if (flag("--apply-verified")) {
    links.push(...findings.verified.map((f) => ({ recurringBlockId: f.recurringBlockId, occurrenceDate: f.occurrenceDate, bookingId: f.bookingId })));
  }
  for (const raw of values("--link")) {
    const [serie, date, booking] = raw.split(":");
    if (!serie || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !booking) throw new Error(`--link invalide : ${raw}`);
    links.push({ recurringBlockId: Number(serie), occurrenceDate: date, bookingId: Number(booking) });
  }
  if (links.length > 0) {
    const { applied } = await applyOccurrenceLinks(db, links, "scripts/reconcile-recurring-ghosts");
    console.log(`\n✔ ${applied}/${links.length} lien(s) appliqué(s).`);
  }
  const releases = values("--release").map((raw) => {
    const [serie, date] = raw.split(":");
    if (!serie || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error(`--release invalide : ${raw}`);
    return { recurringBlockId: Number(serie), occurrenceDate: date };
  });
  if (releases.length > 0) {
    const { applied } = await applyOccurrenceReleases(db, releases, "Libérée par scripts/reconcile-recurring-ghosts");
    console.log(`✔ ${applied} occurrence(s) libérée(s).`);
  }
  if (links.length === 0 && releases.length === 0) {
    console.log("\nLecture seule : aucune modification effectuée.");
  }
} finally {
  await db.$disconnect();
}
