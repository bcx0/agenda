/**
 * Fusion de plages horaires "HH:mm" (heure de Bruxelles, convention projet).
 *
 * Utilisé par l'ajout manuel de créneau (panneau jour admin) : la nouvelle
 * plage est fusionnée avec les plages effectives du jour AVANT d'être soumise
 * à setGeneralAvailabilityForDateAction. Sans cette union, un override OPEN
 * REMPLACERAIT les disponibilités existantes du jour (cf. lib/booking.ts:283)
 * et l'ajout d'un créneau ferait disparaître les autres.
 *
 * Fichier .mjs (allowJs) pour être importable à la fois par le code Next (TS)
 * et par les tests node purs (tests/merge-ranges.test.mjs).
 */

/** "HH:mm" → minutes depuis minuit, ou null si invalide. */
export function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** minutes depuis minuit → "HH:mm". */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Normalise, trie et fusionne des plages { startTime, endTime } :
 * - ignore les plages invalides (format, start >= end) ;
 * - fusionne les chevauchements ET les plages adjacentes (17:00-18:00 +
 *   18:00-19:00 → 17:00-19:00, mêmes créneaux générés par le moteur) ;
 * - déduplique.
 * Retourne une nouvelle liste triée par heure de début.
 */
export function mergeRanges(ranges) {
  const normalized = [];
  for (const range of ranges ?? []) {
    const start = parseTimeToMinutes(range?.startTime);
    const end = parseTimeToMinutes(range?.endTime);
    if (start === null || end === null || start >= end) continue;
    normalized.push([start, end]);
  }
  normalized.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged = [];
  for (const [start, end] of normalized) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged.map(([start, end]) => ({
    startTime: minutesToTime(start),
    endTime: minutesToTime(end)
  }));
}
