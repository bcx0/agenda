/**
 * Tests unitaires — lib/ranges.mjs (fusion de plages horaires).
 *
 * Contexte : l'ajout manuel d'un créneau (panneau jour admin) soumet l'UNION
 * des plages effectives du jour + la nouvelle plage. Ces tests verrouillent la
 * fusion : chevauchements, adjacence, doublons, entrées invalides.
 *
 * Lancer :  node tests/merge-ranges.test.mjs
 */

import { mergeRanges, subtractRange, parseTimeToMinutes, minutesToTime } from "../lib/ranges.mjs";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  ❌ ÉCHEC:", msg); }
}
function eq(actual, expected, msg) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${msg}\n     attendu: ${JSON.stringify(expected)}\n     obtenu : ${JSON.stringify(actual)}`);
}

// ── parse / format ──
assert(parseTimeToMinutes("09:00") === 540, "09:00 = 540 min");
assert(parseTimeToMinutes("9") === 540, "\"9\" = 540 min (minutes implicites)");
assert(parseTimeToMinutes("abc") === null, "format invalide → null");
assert(parseTimeToMinutes("25:00") === null, "25:00 → null");
assert(minutesToTime(1020) === "17:00", "1020 min = 17:00");

// ── plages disjointes : triées, inchangées ──
eq(
  mergeRanges([
    { startTime: "14:00", endTime: "15:00" },
    { startTime: "09:00", endTime: "12:00" }
  ]),
  [
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "14:00", endTime: "15:00" }
  ],
  "plages disjointes triées"
);

// ── chevauchement partiel fusionné ──
eq(
  mergeRanges([
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "11:00", endTime: "13:00" }
  ]),
  [{ startTime: "09:00", endTime: "13:00" }],
  "chevauchement partiel fusionné"
);

// ── plage englobée absorbée ──
eq(
  mergeRanges([
    { startTime: "09:00", endTime: "18:00" },
    { startTime: "10:00", endTime: "11:00" }
  ]),
  [{ startTime: "09:00", endTime: "18:00" }],
  "plage englobée absorbée"
);

// ── plages adjacentes fusionnées (17-18 + 18-19 → 17-19) ──
eq(
  mergeRanges([
    { startTime: "17:00", endTime: "18:00" },
    { startTime: "18:00", endTime: "19:00" }
  ]),
  [{ startTime: "17:00", endTime: "19:00" }],
  "plages adjacentes fusionnées"
);

// ── doublon exact dédupliqué ──
eq(
  mergeRanges([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "09:00", endTime: "10:00" }
  ]),
  [{ startTime: "09:00", endTime: "10:00" }],
  "doublon exact dédupliqué"
);

// ── cas réel : jour avec dispos 9-12 / 14-17, ajout d'un créneau 18-19 ──
eq(
  mergeRanges([
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "14:00", endTime: "17:00" },
    { startTime: "18:00", endTime: "19:00" }
  ]),
  [
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "14:00", endTime: "17:00" },
    { startTime: "18:00", endTime: "19:00" }
  ],
  "ajout d'un créneau isolé ne touche pas les plages existantes"
);

// ── entrées invalides ignorées ──
eq(
  mergeRanges([
    { startTime: "12:00", endTime: "12:00" }, // start == end
    { startTime: "15:00", endTime: "14:00" }, // end < start
    { startTime: "xx", endTime: "10:00" },    // format
    { startTime: "09:00", endTime: "10:00" }  // valide
  ]),
  [{ startTime: "09:00", endTime: "10:00" }],
  "entrées invalides ignorées"
);

// ── liste vide / null ──
eq(mergeRanges([]), [], "liste vide → []");
eq(mergeRanges(null), [], "null → []");

// ── subtractRange : retrait au milieu → scission ──
eq(
  subtractRange(
    [{ startTime: "09:00", endTime: "17:00" }],
    { startTime: "12:00", endTime: "13:00" }
  ),
  [
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "13:00", endTime: "17:00" }
  ],
  "retrait au milieu scinde la plage"
);

// ── subtractRange : retrait sur un bord → troncature ──
eq(
  subtractRange(
    [{ startTime: "09:00", endTime: "12:00" }],
    { startTime: "09:00", endTime: "10:00" }
  ),
  [{ startTime: "10:00", endTime: "12:00" }],
  "retrait au bord tronque la plage"
);

// ── subtractRange : plage exacte → supprimée ──
eq(
  subtractRange(
    [
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "14:00", endTime: "15:00" }
    ],
    { startTime: "14:00", endTime: "15:00" }
  ),
  [{ startTime: "09:00", endTime: "10:00" }],
  "retrait exact supprime la plage"
);

// ── subtractRange : dernier créneau → liste vide ──
eq(
  subtractRange(
    [{ startTime: "18:00", endTime: "19:00" }],
    { startTime: "18:00", endTime: "19:00" }
  ),
  [],
  "retrait du dernier créneau → []"
);

// ── subtractRange : pas de chevauchement → inchangé ──
eq(
  subtractRange(
    [{ startTime: "09:00", endTime: "10:00" }],
    { startTime: "15:00", endTime: "16:00" }
  ),
  [{ startTime: "09:00", endTime: "10:00" }],
  "retrait sans chevauchement ne change rien"
);

// ── subtractRange : coupe invalide → plages juste fusionnées ──
eq(
  subtractRange(
    [{ startTime: "09:00", endTime: "10:00" }],
    { startTime: "xx", endTime: "yy" }
  ),
  [{ startTime: "09:00", endTime: "10:00" }],
  "coupe invalide ignorée"
);

console.log(`\n${passed} OK, ${failed} échec(s)`);
if (failed > 0) process.exit(1);
