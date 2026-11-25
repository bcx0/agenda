/**
 * Blocs récurrents (RecurringBlock) — comparaison timezone-aware.
 *
 * ROOT CAUSE du bug "13h jamais disponible en Belgique" (signalé le 24/08/2026) :
 * l'ancien code comparait `block.startTime` (chaîne "HH:mm") directement aux
 * minutes du créneau exprimées en heure de Bruxelles, en IGNORANT totalement la
 * colonne `RecurringBlock.timeZone`. Cinq lignes créées avec des heures UTC
 * ("13:00" pour un bloc censé couvrir 15:00 Bruxelles) bloquaient donc
 * 13:00-14:00 Bruxelles du lundi au vendredi. Un bloc créé avec
 * timeZone=America/New_York aurait pareillement bloqué l'heure de Bruxelles au
 * lieu de l'heure de Miami.
 *
 * Convention désormais : `startTime`/`endTime` sont des heures MURALES dans
 * `block.timeZone` (défaut Europe/Brussels si null). Le jour (`dayOfWeek`,
 * ISO 1=lundi…7=dimanche) est lui aussi évalué dans cette timezone — un bloc
 * "lundi 22:00 America/New_York" tombe mardi 04:00 à Bruxelles et doit quand
 * même matcher.
 *
 * Fichier .mjs (allowJs) pour être importable par le code Next (TS) ET par les
 * tests node purs (tests/recurring-block.test.mjs), comme lib/ranges.mjs.
 */

import { findBlockers } from "./availability-engine.mjs";

const DEFAULT_BLOCK_TZ = "Europe/Brussels";

/**
 * Le créneau [slotStartUtc, slotEndUtc) chevauche-t-il ce bloc récurrent ?
 *
 * Depuis le 25/11/2026, délègue au moteur unique (lib/availability-engine.mjs,
 * occurrences calculées dans le fuseau du bloc) : les tests de régression
 * historiques (bug du 13h, décalages d'heure, minuit) vérifient donc le
 * moteur réellement utilisé par l'application.
 *
 * @param {Date} slotStartUtc  début du créneau (instant UTC)
 * @param {Date} slotEndUtc    fin du créneau (instant UTC)
 * @param {{ dayOfWeek: number, startTime: string, endTime: string, timeZone?: string | null }} block
 * @returns {boolean}
 */
export function recurringBlockOverlapsSlot(slotStartUtc, slotEndUtc, block) {
  if (!(slotStartUtc instanceof Date) || !(slotEndUtc instanceof Date)) return false;
  if (slotEndUtc.getTime() <= slotStartUtc.getTime()) return false;
  const series = {
    id: -1,
    dayOfWeek: block.dayOfWeek,
    startTime: block.startTime,
    endTime: block.endTime,
    timeZone: block.timeZone ?? null,
    clientId: null,
    note: null,
    startDate: null,
    endDate: null
  };
  return findBlockers(slotStartUtc, slotEndUtc, { recurringBlocks: [series] }).some((b) => b.kind === "recurring");
}

/**
 * Étiquette lisible d'un bloc récurrent (pour l'affichage de la cause d'un
 * créneau bloqué dans le panneau admin).
 * @param {{ startTime: string, endTime: string, timeZone?: string | null, note?: string | null }} block
 */
export function recurringBlockLabel(block) {
  const tzLabel =
    (block.timeZone || DEFAULT_BLOCK_TZ) === "America/New_York" ? "Miami" : "Bruxelles";
  const base = `Bloc récurrent ${block.startTime}-${block.endTime} (${tzLabel})`;
  return block.note ? `${base} — ${block.note}` : base;
}
