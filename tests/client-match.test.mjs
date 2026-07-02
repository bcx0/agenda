/**
 * Tests de régression — appariement d'un titre d'événement Google Calendar
 * vers le bon client (lib/fuzzy-match.ts `matchClientNameIndex`).
 *
 * Contexte du bug (juin 2026) : la synchro Google liait un événement au client
 * par un fuzzy-match au seuil 0.5. "Audrey Napoli" (nouvelle cliente) obtenait
 * un score de 0.538 face à "Andrea Maron" (cliente existante) et était donc
 * enregistrée SOUS LE NOM D'ANDREA MARON. Symptômes signalés :
 *   - on met "Audrey Napoli" → c'est "Andrea Maron" qui se note ;
 *   - "Andrea Maron" reste affichée après remplacement.
 *
 * Correctif verrouillé ici : matching strict (exact → token-subset unique →
 * fuzzy >= 0.85). En dessous, AUCUN client n'est deviné (la synchro crée un
 * bloc [NO_ACCOUNT] visible, réconciliable à la main).
 *
 * Lancer :  node tests/client-match.test.mjs
 * (Aucune dépendance : réimplémente EXACTEMENT la logique de lib/fuzzy-match.ts,
 *  comme tests/timezone-display.test.mjs réimplémente le rendu corrigé.)
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  ❌ ÉCHEC:", msg); }
}

// ─── Copie fidèle de lib/fuzzy-match.ts ──────────────────────────────
const CLIENT_MATCH_THRESHOLD = 0.85;

function removeAccents(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalizeName(name) {
  return removeAccents(name.trim().replace(/\s+/g, " ")).toLowerCase();
}
function nameTokens(name) {
  return normalizeName(name).split(" ").filter(Boolean).sort();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  return dp[m][n];
}
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
function fuzzyMatchName(query, candidates, threshold = 0.65) {
  const qNorm = normalizeName(query);
  const qTokens = nameTokens(query);
  let bestIndex = -1, bestScore = 0;
  for (let i = 0; i < candidates.length; i++) {
    const cNorm = normalizeName(candidates[i]);
    const cTokens = nameTokens(candidates[i]);
    if (qNorm === cNorm) return { index: i, score: 1.0 };
    if (qTokens.join(" ") === cTokens.join(" ")) return { index: i, score: 0.95 };
    let tokenScore = 0;
    if (qTokens.length > 0 && cTokens.length > 0) {
      const usedC = new Set();
      let totalSim = 0;
      for (const qt of qTokens) {
        let bestTokenSim = 0, bestTokenIdx = -1;
        for (let ci = 0; ci < cTokens.length; ci++) {
          if (usedC.has(ci)) continue;
          const sim = similarity(qt, cTokens[ci]);
          if (sim > bestTokenSim) { bestTokenSim = sim; bestTokenIdx = ci; }
        }
        if (bestTokenIdx >= 0) usedC.add(bestTokenIdx);
        totalSim += bestTokenSim;
      }
      const maxTokens = Math.max(qTokens.length, cTokens.length);
      tokenScore = (totalSim / maxTokens) * 0.95;
    }
    const fullScore = similarity(qNorm, cNorm);
    const score = Math.max(tokenScore, fullScore);
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  if (bestScore >= threshold && bestIndex >= 0) return { index: bestIndex, score: bestScore };
  return null;
}
function isTokenSubsetMatch(a, b) {
  const at = nameTokens(a), bt = nameTokens(b);
  if (at.length === 0 || bt.length === 0) return false;
  const [small, big] = at.length <= bt.length ? [at, bt] : [bt, at];
  const bigSet = new Set(big);
  return small.every((t) => bigSet.has(t));
}
function matchClientNameIndex(query, candidates, threshold = CLIENT_MATCH_THRESHOLD) {
  const qNorm = normalizeName(query);
  for (let i = 0; i < candidates.length; i++)
    if (normalizeName(candidates[i]) === qNorm) return i;
  const subsetMatches = [];
  for (let i = 0; i < candidates.length; i++)
    if (isTokenSubsetMatch(query, candidates[i])) subsetMatches.push(i);
  if (subsetMatches.length === 1) return subsetMatches[0];
  const fuzzy = fuzzyMatchName(query, candidates, threshold);
  return fuzzy ? fuzzy.index : null;
}

// helper de lisibilité
function matchName(query, candidates) {
  const i = matchClientNameIndex(query, candidates);
  return i === null ? null : candidates[i];
}

console.log("=== Tests appariement client (matchClientNameIndex) ===\n");

// ── LE bug signalé : Audrey ne doit JAMAIS devenir Andrea ──
console.log("Régression Audrey / Andrea :");
assert(
  matchName("Audrey Napoli", ["Andrea Maron"]) === null,
  '"Audrey Napoli" ne doit PAS matcher "Andrea Maron" (0.538 < 0.85) → NO_ACCOUNT'
);
assert(
  matchName("Andrea Maron", ["Andrea Maron", "Audrey Napoli"]) === "Andrea Maron",
  '"Andrea Maron" doit matcher exactement "Andrea Maron"'
);
assert(
  matchName("Audrey Napoli", ["Andrea Maron", "Audrey Napoli"]) === "Audrey Napoli",
  '"Audrey Napoli" doit matcher "Audrey Napoli" quand elle existe'
);
// nom/prénom inversés = même personne
assert(
  matchName("Napoli Audrey", ["Andrea Maron", "Audrey Napoli"]) === "Audrey Napoli",
  'ordre inversé "Napoli Audrey" doit matcher "Audrey Napoli"'
);

// ── Prénom seul → token-subset unique ──
console.log("Prénom/nom partiel :");
assert(
  matchName("Andrea", ["Andrea Maron"]) === "Andrea Maron",
  '"Andrea" (prénom seul) doit matcher "Andrea Maron" (subset unique)'
);
assert(
  matchName("Marie", ["Marie-Claire Dupont"]) === null,
  '"Marie" ne doit PAS matcher "Marie-Claire Dupont" (pas un token entier)'
);
// subset ambigu → refusé
assert(
  matchName("Napoli", ["Audrey Napoli", "Marco Napoli"]) === null,
  '"Napoli" ambigu (2 clients) → refusé, pas de devinette'
);

// ── Fautes de frappe légères (le fuzzy doit encore aider Geoffrey) ──
console.log("Tolérance aux fautes de frappe :");
assert(
  matchName("Audrey Napolie", ["Audrey Napoli"]) === "Audrey Napoli",
  '"Audrey Napolie" (1 lettre) doit matcher "Audrey Napoli"'
);
assert(
  matchName("Jean Dupont", ["Jean Dupond"]) === "Jean Dupont" || // exact fails; check via fuzzy
    matchName("Jean Dupont", ["Jean Dupond"]) === "Jean Dupond",
  '"Jean Dupont" ~ "Jean Dupond" (faute finale) doit matcher'
);

// ── Deux personnes proches mais distinctes → prudence ──
console.log("Homonymes proches :");
assert(
  matchName("Audrey Napoli", ["Andrea Napoli"]) === null,
  '"Audrey Napoli" vs "Andrea Napoli" (0.846 < 0.85) → refusé (personnes différentes)'
);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} assertions OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
