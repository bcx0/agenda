/**
 * Tests de régression — lib/recurring.mjs (blocs récurrents timezone-aware).
 *
 * Contexte du bug (signalé le 24/08/2026) : « le 13h n'est jamais disponible
 * quand je suis en Belgique ». Cinq RecurringBlock 13:00-14:00 (lun→ven,
 * timeZone NULL, note "Bloc 15h Brussels") bloquaient 13:00 Bruxelles chaque
 * jour ouvré : l'ancien moteur comparait startTime/endTime aux minutes du
 * créneau en heure de Bruxelles en IGNORANT la colonne timeZone. Ces tests
 * verrouillent la nouvelle sémantique : les heures d'un bloc sont des heures
 * murales dans SA timezone (défaut Europe/Brussels), jour compris.
 *
 * Lancer :  node tests/recurring-block.test.mjs
 */

import { recurringBlockOverlapsSlot, recurringBlockLabel } from "../lib/recurring.mjs";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function utc(iso) {
  return new Date(iso);
}

function slotHour(startIso) {
  const start = utc(startIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [start, end];
}

// ── 1. timeZone NULL = heure de Bruxelles (comportement historique conservé) ──
{
  // Mercredi 16/09/2026 (weekday 3), 13:00-14:00 Bruxelles = 11:00 UTC (CEST)
  const block = { dayOfWeek: 3, startTime: "13:00", endTime: "14:00", timeZone: null };
  const [s1, e1] = slotHour("2026-09-16T11:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s1, e1, block) === true,
    "bloc 13:00 tz NULL bloque 13:00 Bruxelles (été)"
  );
  const [s2, e2] = slotHour("2026-09-16T13:00:00Z"); // 15:00 Bruxelles
  assert(
    recurringBlockOverlapsSlot(s2, e2, block) === false,
    "bloc 13:00 tz NULL ne bloque PAS 15:00 Bruxelles"
  );
  // Hiver (CET, UTC+1) : 13:00 Bruxelles = 12:00 UTC — mercredi 20/01/2027
  const [s3, e3] = slotHour("2027-01-20T12:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s3, e3, block) === true,
    "bloc 13:00 tz NULL bloque 13:00 Bruxelles (hiver)"
  );
  // Mauvais jour : jeudi 17/09 13:00 Bruxelles
  const [s4, e4] = slotHour("2026-09-17T11:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s4, e4, block) === false,
    "bloc mercredi ne bloque pas le jeudi"
  );
}

// ── 2. timeZone America/New_York = heure de Miami, pas de Bruxelles ──────────
{
  // Lundi 14/09/2026 : 13:00 EDT = 17:00 UTC = 19:00 Bruxelles
  const block = { dayOfWeek: 1, startTime: "13:00", endTime: "14:00", timeZone: "America/New_York" };
  const [s1, e1] = slotHour("2026-09-14T17:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s1, e1, block) === true,
    "bloc 13:00 Miami bloque 19:00 Bruxelles (été)"
  );
  const [s2, e2] = slotHour("2026-09-14T11:00:00Z"); // 13:00 Bruxelles = 07:00 Miami
  assert(
    recurringBlockOverlapsSlot(s2, e2, block) === false,
    "bloc 13:00 Miami ne bloque PAS 13:00 Bruxelles (root cause du bug 13h)"
  );
}

// ── 3. Divergence DST UE/US (25/10 → 01/11) : offset 5h au lieu de 6h ────────
{
  // Mercredi 28/10/2026 : UE déjà en CET, US encore en EDT.
  // 13:00 EDT = 17:00 UTC = 18:00 Bruxelles.
  const block = { dayOfWeek: 3, startTime: "13:00", endTime: "14:00", timeZone: "America/New_York" };
  const [s1, e1] = slotHour("2026-10-28T17:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s1, e1, block) === true,
    "semaine de divergence DST : 13:00 Miami = 18:00 Bruxelles bien bloqué"
  );
  const [s2, e2] = slotHour("2026-10-28T18:00:00Z"); // 14:00 EDT — hors bloc
  assert(
    recurringBlockOverlapsSlot(s2, e2, block) === false,
    "semaine de divergence DST : 14:00 Miami hors bloc"
  );
}

// ── 4. Le jour se juge dans la timezone DU BLOC (changement de jour) ─────────
{
  // Bloc lundi 22:00-23:00 Miami = mardi 04:00-05:00 Bruxelles (été)
  const block = { dayOfWeek: 1, startTime: "22:00", endTime: "23:00", timeZone: "America/New_York" };
  const [s1, e1] = slotHour("2026-09-15T02:00:00Z"); // mardi 04:00 Bruxelles = lundi 22:00 EDT
  assert(
    recurringBlockOverlapsSlot(s1, e1, block) === true,
    "bloc lundi 22:00 Miami bloque mardi 04:00 Bruxelles"
  );
  const [s2, e2] = slotHour("2026-09-14T20:00:00Z"); // lundi 22:00 Bruxelles = 16:00 EDT
  assert(
    recurringBlockOverlapsSlot(s2, e2, block) === false,
    "bloc lundi 22:00 Miami ne bloque pas lundi 22:00 Bruxelles"
  );
}

// ── 5. Cas réel "All-in" : bloc 21:00-22:00 Bruxelles ────────────────────────
{
  const block = { dayOfWeek: 1, startTime: "21:00", endTime: "22:00", timeZone: null };
  const [s1, e1] = slotHour("2026-09-14T19:00:00Z"); // lundi 21:00 Bruxelles
  assert(
    recurringBlockOverlapsSlot(s1, e1, block) === true,
    "bloc All-in 21:00 Bruxelles bloque le créneau 21:00 Bruxelles"
  );
}

// ── 6. Créneau à cheval sur minuit : la partie après minuit compte ───────────
{
  // Créneau lundi 23:30 → mardi 00:30 Bruxelles ; bloc mardi 00:00-01:00 Bruxelles
  const start = utc("2026-09-14T21:30:00Z"); // 23:30 Bruxelles
  const end = utc("2026-09-14T22:30:00Z"); // mardi 00:30 Bruxelles
  const block = { dayOfWeek: 2, startTime: "00:00", endTime: "01:00", timeZone: null };
  assert(
    recurringBlockOverlapsSlot(start, end, block) === true,
    "créneau 23:30-00:30 chevauche un bloc du jour suivant 00:00-01:00"
  );
}

// ── 7. Entrées invalides ─────────────────────────────────────────────────────
{
  const [s, e] = slotHour("2026-09-16T11:00:00Z");
  assert(
    recurringBlockOverlapsSlot(s, e, { dayOfWeek: 3, startTime: "x", endTime: "14:00", timeZone: null }) === false,
    "startTime invalide → false"
  );
  assert(
    recurringBlockOverlapsSlot(s, e, { dayOfWeek: 3, startTime: "14:00", endTime: "13:00", timeZone: null }) === false,
    "plage inversée → false"
  );
  assert(
    recurringBlockOverlapsSlot(s, s, { dayOfWeek: 3, startTime: "13:00", endTime: "14:00", timeZone: null }) === false,
    "créneau de durée nulle → false"
  );
}

// ── 8. Étiquette de diagnostic ───────────────────────────────────────────────
{
  const label = recurringBlockLabel({ startTime: "13:00", endTime: "14:00", timeZone: null, note: "Bloc 15h Brussels - supprimé par Geoffrey" });
  assert(
    label.includes("13:00-14:00") && label.includes("Bruxelles") && label.includes("supprimé par Geoffrey"),
    "recurringBlockLabel inclut heures, fuseau et note"
  );
  const miamiLabel = recurringBlockLabel({ startTime: "09:00", endTime: "10:00", timeZone: "America/New_York" });
  assert(miamiLabel.includes("Miami"), "recurringBlockLabel affiche Miami pour America/New_York");
}

console.log(`\nrecurring-block.test.mjs : ${passed} réussis, ${failed} échoués`);
if (failed > 0) process.exit(1);
