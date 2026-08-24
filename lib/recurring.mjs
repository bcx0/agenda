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

import { DateTime } from "luxon";

const DEFAULT_BLOCK_TZ = "Europe/Brussels";

/** "HH:mm" → minutes depuis minuit, ou null si invalide. */
function toMinutes(value) {
  if (typeof value !== "string") return null;
  const [hourStr, minuteStr = "0"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Le créneau [slotStartUtc, slotEndUtc) chevauche-t-il ce bloc récurrent ?
 *
 * @param {Date} slotStartUtc  début du créneau (instant UTC)
 * @param {Date} slotEndUtc    fin du créneau (instant UTC)
 * @param {{ dayOfWeek: number, startTime: string, endTime: string, timeZone?: string | null }} block
 * @returns {boolean}
 */
export function recurringBlockOverlapsSlot(slotStartUtc, slotEndUtc, block) {
  const blockStart = toMinutes(block.startTime);
  const blockEnd = toMinutes(block.endTime);
  if (blockStart === null || blockEnd === null || blockEnd <= blockStart) {
    return false;
  }

  const zone = block.timeZone || DEFAULT_BLOCK_TZ;
  const startInZone = DateTime.fromJSDate(slotStartUtc, { zone: "utc" }).setZone(zone);
  if (!startInZone.isValid) return false;

  const durationMin = Math.round(
    (slotEndUtc.getTime() - slotStartUtc.getTime()) / 60000
  );
  if (durationMin <= 0) return false;

  const slotStartMin = startInZone.hour * 60 + startInZone.minute;
  const slotEndMin = slotStartMin + durationMin;

  // Jour du créneau évalué dans la timezone DU BLOC.
  if (
    startInZone.weekday === block.dayOfWeek &&
    slotStartMin < blockEnd &&
    slotEndMin > blockStart
  ) {
    return true;
  }

  // Créneau à cheval sur minuit (dans la timezone du bloc) : la partie après
  // minuit appartient au jour suivant et peut chevaucher un bloc de ce jour-là.
  if (slotEndMin > 24 * 60) {
    const nextWeekday = startInZone.plus({ days: 1 }).weekday;
    const spillEnd = slotEndMin - 24 * 60;
    if (nextWeekday === block.dayOfWeek && 0 < blockEnd && spillEnd > blockStart) {
      return true;
    }
  }

  return false;
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
