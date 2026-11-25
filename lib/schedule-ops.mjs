/**
 * Opérations d'écriture sur l'agenda (disponibilités, séries récurrentes),
 * 25/11/2026.
 *
 * Chaque opération :
 *  - s'exécute dans UNE transaction, sérialisée par un verrou applicatif
 *    (pg_advisory_xact_lock) : deux actions simultanées (deux onglets admin,
 *    admin + client) ne peuvent pas se croiser ;
 *  - applique la logique de priorité du moteur (lib/availability-engine.mjs) :
 *    une réservation réelle n'est jamais écrasée, une indisponibilité
 *    explicite n'est jamais levée implicitement ;
 *  - VÉRIFIE le résultat avant de valider (relecture dans la transaction) :
 *    si le créneau n'est pas réellement dans l'état attendu, tout est annulé
 *    et la raison est renvoyée. Aucune action ne « réussit » en silence sans
 *    effet ;
 *  - renvoie { ok: true, message, ... } ou { ok: false, code, error, ... }.
 *
 * Les effets externes (emails, Google Calendar) ne sont PAS faits ici : la
 * couche serveur (actions admin) les déclenche après validation, à partir des
 * identifiants renvoyés. `db` est un client Prisma injecté (tests isolés).
 */

import { DateTime } from "luxon";
import {
  BRUSSELS_TZ,
  MIAMI_TZ,
  addDaysIso,
  checkInterval,
  expandSeries,
  existingRangesForBrusselsDate,
  findBlockers,
  isoDateInZone,
  isoDateToDbDate,
  isWithinAvailability,
  isWithinSeriesPeriod,
  minutesToTime,
  occurrenceInterval,
  seriesLabel,
  seriesZone,
  toIsoDateOnly,
  toMinutes,
  wallTimeToUtc,
  weekdayOfIso
} from "./availability-engine.mjs";
import { loadAvailabilityData } from "./availability-data.mjs";
import { mergeRanges } from "./ranges.mjs";

export const SCHEDULE_LOCK_KEY = 4242001;
export const DAY_CLOSED_NOTE = "Journée fermée depuis le panneau jour";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Erreur métier : annule la transaction et remonte un résultat lisible. */
class ScheduleError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

/** Prend le verrou applicatif de l'agenda pour la transaction en cours. */
export async function lockSchedule(tx) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`);
}

async function runScheduleTransaction(db, fn) {
  try {
    return await db.$transaction(
      async (tx) => {
        await lockSchedule(tx);
        return fn(tx);
      },
      { timeout: 20000, maxWait: 10000 }
    );
  } catch (err) {
    if (err instanceof ScheduleError) {
      return { ok: false, code: err.code, error: err.message, ...err.extra };
    }
    throw err;
  }
}

function frDate(iso) {
  return DateTime.fromISO(iso, { zone: BRUSSELS_TZ }).setLocale("fr").toFormat("cccc dd LLLL yyyy");
}

function frTime(instant, zone = BRUSSELS_TZ) {
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(zone).toFormat("HH:mm");
}

function frDateTime(instant) {
  const local = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(BRUSSELS_TZ).setLocale("fr");
  const miami = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(MIAMI_TZ);
  return `${local.toFormat("cccc dd LLLL yyyy 'à' HH:mm")} Bruxelles (${miami.toFormat("HH:mm")} Miami)`;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid;
}

async function loadAround(tx, startUtc, endUtc) {
  return loadAvailabilityData(tx, new Date(startUtc.getTime() - DAY_MS), new Date(endUtc.getTime() + DAY_MS));
}

function hourlyPieces(startUtc, endUtc) {
  const pieces = [];
  for (let t = startUtc.getTime(); t < endUtc.getTime(); t += 60 * 60 * 1000) {
    pieces.push([new Date(t), new Date(Math.min(t + 60 * 60 * 1000, endUtc.getTime()))]);
  }
  return pieces;
}

async function loadSeries(tx, recurringBlockId) {
  const block = await tx.recurringBlock.findUnique({
    where: { id: recurringBlockId },
    include: { client: { select: { id: true, name: true } } }
  });
  if (!block) throw new ScheduleError("NOT_FOUND", "Série récurrente introuvable (déjà supprimée ?).");
  return {
    ...block,
    startDate: toIsoDateOnly(block.startDate),
    endDate: toIsoDateOnly(block.endDate),
    clientName: block.client?.name ?? null
  };
}

/** Occurrence d'une série à une date, avec son état actuel. */
async function loadOccurrence(tx, series, occurrenceDate) {
  if (!isIsoDate(occurrenceDate)) throw new ScheduleError("INVALID", "Date d'occurrence invalide.");
  const interval = occurrenceInterval(series, occurrenceDate);
  if (!interval) {
    throw new ScheduleError("INVALID", `Le ${frDate(occurrenceDate)} n'est pas un jour de cette série.`);
  }
  if (!isWithinSeriesPeriod(series, occurrenceDate)) {
    throw new ScheduleError("INVALID", `Le ${frDate(occurrenceDate)} est en dehors de la période de cette série.`);
  }
  const ctx = await loadAround(tx, interval.startUtc, interval.endUtc);
  const occurrence = expandSeries(series, ctx, interval.startUtc, interval.endUtc).find(
    (o) => o.dateIso === occurrenceDate
  );
  if (!occurrence) throw new ScheduleError("INVALID", "Occurrence introuvable.");
  return { occurrence, ctx, interval };
}

function bookingBackedError(occurrence, series) {
  return new ScheduleError(
    "BOOKING_BACKED",
    `Cette occurrence est une réservation réelle${series.clientName ? ` de ${series.clientName}` : ""} : déplacez ou annulez le rendez-vous lui-même (une réservation n'est jamais supprimée par une libération de créneau).`,
    { bookingId: occurrence.bookingId }
  );
}

// ─── Ajouter une disponibilité ─────────────────────────────────────────────

/**
 * « Ajouter un créneau » : rend [startTime, endTime) (heure de Bruxelles)
 * réellement réservable le `dateIso` (date de Bruxelles).
 *  - réservation présente → refus explicite (jamais écrasée) ;
 *  - indisponibilité explicite (exception BLOCK, bloc Google/manuel) → refus
 *    explicite (à lever volontairement d'abord). Seule exception : la
 *    « journée fermée » posée par le panneau jour, levée comme avant ;
 *  - occurrence de série récurrente → exception SKIP pour CETTE date ;
 *  - hors horaires habituels → ouverture du jour (exception OPEN) fusionnée
 *    avec l'existant (les autres créneaux du jour sont conservés).
 */
export async function addAvailability(db, input) {
  const { dateIso, startTime, endTime } = input;
  if (!isIsoDate(dateIso)) return { ok: false, code: "INVALID", error: "Date invalide." };
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return { ok: false, code: "INVALID", error: "Plage horaire invalide (la fin doit être après le début)." };
  }
  const startUtc = wallTimeToUtc(dateIso, startMin, BRUSSELS_TZ);
  const endUtc = wallTimeToUtc(dateIso, endMin, BRUSSELS_TZ);
  if (!startUtc || !endUtc) {
    return { ok: false, code: "INVALID", error: "Cette heure n'existe pas ce jour-là (changement d'heure)." };
  }
  if (endUtc.getTime() <= Date.now()) {
    return { ok: false, code: "PAST", error: "Ce créneau est déjà passé." };
  }
  const rangeLabel = `${startTime}-${endTime}`;

  return runScheduleTransaction(db, async (tx) => {
    const ctx = await loadAround(tx, startUtc, endUtc);
    const blockers = findBlockers(startUtc, endUtc, ctx);

    const booking = blockers.find((b) => b.kind === "booking");
    if (booking) {
      throw new ScheduleError(
        "BOOKING_CONFLICT",
        `Impossible d'ouvrir ${rangeLabel} le ${frDate(dateIso)} : ${booking.label}. Une réservation n'est jamais écrasée par une disponibilité.`,
        { blockers }
      );
    }

    const closedDayOverrides = ctx.overrides.filter(
      (o) =>
        o.type === "BLOCK" &&
        o.startTime === "00:00" &&
        o.endTime === "24:00" &&
        o.note === DAY_CLOSED_NOTE &&
        isoDateInZone(o.date, BRUSSELS_TZ) === dateIso
    );
    const closedIds = new Set(closedDayOverrides.map((o) => o.id));
    const explicit = blockers.filter(
      (b) =>
        (b.kind === "manual_block" && !closedIds.has(b.overrideId)) ||
        b.kind === "calendar_block" ||
        (b.kind === "recurring" && b.movedOccurrence)
    );
    if (explicit.length > 0) {
      throw new ScheduleError(
        "EXPLICIT_BLOCK",
        `Impossible d'ouvrir ${rangeLabel} le ${frDate(dateIso)} : bloqué par « ${explicit[0].label} ». Cette indisponibilité est protégée : levez-la d'abord (bouton « Lever » dans les créneaux bloqués du jour).`,
        { blockers: explicit }
      );
    }

    // 1. Occurrences récurrentes → exception SKIP pour cette date uniquement.
    const released = [];
    for (const blocker of blockers) {
      if (blocker.kind !== "recurring" || blocker.movedOccurrence) continue;
      await tx.recurringBlockException.upsert({
        where: {
          recurringBlockId_occurrenceDate: {
            recurringBlockId: blocker.recurringBlockId,
            occurrenceDate: isoDateToDbDate(blocker.occurrenceDate)
          }
        },
        create: {
          recurringBlockId: blocker.recurringBlockId,
          occurrenceDate: isoDateToDbDate(blocker.occurrenceDate),
          type: "SKIP",
          note: input.note ?? "Libérée via « Ajouter un créneau »"
        },
        update: { type: "SKIP", newStartAt: null, newEndAt: null, note: input.note ?? "Libérée via « Ajouter un créneau »" }
      });
      released.push({ recurringBlockId: blocker.recurringBlockId, occurrenceDate: blocker.occurrenceDate, label: blocker.label });
    }

    // 2. Journée fermée par le panneau jour → rouverte (comportement existant).
    if (closedDayOverrides.length > 0) {
      await tx.availabilityOverride.deleteMany({ where: { id: { in: closedDayOverrides.map((o) => o.id) } } });
    }

    // 3. Hors horaires habituels → ouverture du jour fusionnée avec l'existant.
    const ctxAfterRelease = await loadAround(tx, startUtc, endUtc);
    let openedOutsideHours = false;
    if (!isWithinAvailability(startUtc, endUtc, ctxAfterRelease)) {
      const dayStart = DateTime.fromISO(dateIso, { zone: BRUSSELS_TZ }).startOf("day");
      const dayEnd = dayStart.plus({ days: 1 });
      const merged = mergeRanges([
        ...existingRangesForBrusselsDate(dateIso, ctxAfterRelease),
        { startTime, endTime }
      ]);
      await tx.availabilityOverride.deleteMany({
        where: { type: "OPEN", date: { gte: dayStart.toUTC().toJSDate(), lt: dayEnd.toUTC().toJSDate() } }
      });
      await tx.availabilityOverride.createMany({
        data: merged.map((range) => ({
          date: dayStart.toUTC().toJSDate(),
          startTime: range.startTime,
          endTime: range.endTime,
          type: "OPEN"
        }))
      });
      openedOutsideHours = true;
    }

    // 4. Vérification réelle avant validation : chaque heure doit être libre.
    const ctxFinal = await loadAround(tx, startUtc, endUtc);
    for (const [pieceStart, pieceEnd] of hourlyPieces(startUtc, endUtc)) {
      const check = checkInterval(pieceStart, pieceEnd, ctxFinal);
      if (!check.ok) {
        const reason = check.blockers?.[0]?.label ?? check.error;
        throw new ScheduleError(
          "VERIFY_FAILED",
          `Le créneau ${frTime(pieceStart)} n'a pas pu être rendu disponible (${reason}). Rien n'a été modifié.`,
          { blockers: check.blockers ?? [] }
        );
      }
    }

    const parts = [`Créneau ${rangeLabel} ouvert le ${frDate(dateIso)}.`];
    if (released.length > 0) {
      parts.push(
        `Occurrence${released.length > 1 ? "s" : ""} libérée${released.length > 1 ? "s" : ""} pour cette date uniquement : ${released.map((r) => r.label).join(" ; ")}.`
      );
    }
    if (closedDayOverrides.length > 0) parts.push("La journée, qui était fermée, est rouverte.");
    if (openedOutsideHours) parts.push("Ouverture exceptionnelle ajoutée (hors horaires habituels).");
    return { ok: true, message: parts.join(" "), released, openedOutsideHours };
  });
}

// ─── Occurrences d'une série ───────────────────────────────────────────────

/**
 * Libère UNE occurrence (exception SKIP). Refuse si l'occurrence est une
 * réservation réelle, sauf `cancelBooking: true` : l'appelant annule alors la
 * réservation (emails + Google) avec l'id renvoyé.
 */
export async function skipOccurrence(db, input) {
  const { recurringBlockId, occurrenceDate } = input;
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, recurringBlockId);
    const { occurrence } = await loadOccurrence(tx, series, occurrenceDate);

    if (occurrence.state === "booked") {
      if (!input.cancelBooking) throw bookingBackedError(occurrence, series);
      return {
        ok: true,
        message: `Occurrence du ${frDate(occurrenceDate)} supprimée : le rendez-vous lié va être annulé.`,
        bookingToCancel: occurrence.bookingId
      };
    }
    if (occurrence.state === "released" && occurrence.reason !== "exception") {
      return { ok: true, message: `L'occurrence du ${frDate(occurrenceDate)} était déjà libre (rendez-vous déplacé ou annulé).`, alreadyFree: true };
    }

    await tx.recurringBlockException.upsert({
      where: { recurringBlockId_occurrenceDate: { recurringBlockId, occurrenceDate: isoDateToDbDate(occurrenceDate) } },
      create: {
        recurringBlockId,
        occurrenceDate: isoDateToDbDate(occurrenceDate),
        type: "SKIP",
        note: input.note ?? null
      },
      update: { type: "SKIP", newStartAt: null, newEndAt: null, note: input.note ?? null }
    });

    const { occurrence: after } = await loadOccurrence(tx, series, occurrenceDate);
    if (after.state !== "released") {
      throw new ScheduleError("VERIFY_FAILED", "L'occurrence n'a pas pu être libérée. Rien n'a été modifié.");
    }
    return {
      ok: true,
      message: `${seriesLabel(series)} : occurrence du ${frDate(occurrenceDate)} libérée (les autres semaines restent bloquées).`
    };
  });
}

/**
 * Rebloque une occurrence libérée (« Bloquer une occurrence précise »).
 *  - libérée par une exception → l'exception est retirée ;
 *  - libérée parce que sa réservation a été déplacée/annulée → un blocage
 *    manuel explicite est posé sur l'horaire d'origine.
 * Refusé si un autre rendez-vous occupe désormais ce créneau.
 */
export async function restoreOccurrence(db, input) {
  const { recurringBlockId, occurrenceDate } = input;
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, recurringBlockId);
    const { occurrence, ctx } = await loadOccurrence(tx, series, occurrenceDate);
    if (occurrence.state === "active" || occurrence.state === "booked") {
      return { ok: true, message: `L'occurrence du ${frDate(occurrenceDate)} est déjà bloquée.`, alreadyBlocked: true };
    }
    const taken = findBlockers(occurrence.startUtc, occurrence.endUtc, ctx).find((b) => b.kind === "booking");
    if (taken) {
      throw new ScheduleError(
        "BOOKING_CONFLICT",
        `Impossible de rebloquer le ${frDate(occurrenceDate)} : ${taken.label} occupe déjà ce créneau.`,
        { blockers: [taken] }
      );
    }

    if (occurrence.reason === "exception") {
      await tx.recurringBlockException.delete({
        where: { recurringBlockId_occurrenceDate: { recurringBlockId, occurrenceDate: isoDateToDbDate(occurrenceDate) } }
      });
    } else {
      const local = DateTime.fromJSDate(occurrence.startUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
      const localEnd = DateTime.fromJSDate(occurrence.endUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
      await tx.availabilityOverride.create({
        data: {
          date: local.startOf("day").toUTC().toJSDate(),
          startTime: local.toFormat("HH:mm"),
          endTime: localEnd.toISODate() !== local.toISODate() ? "24:00" : localEnd.toFormat("HH:mm"),
          type: "BLOCK",
          note: `Occurrence rebloquée — ${series.note ?? seriesLabel(series)}`
        }
      });
    }

    const ctxAfter = await loadAround(tx, occurrence.startUtc, occurrence.endUtc);
    if (findBlockers(occurrence.startUtc, occurrence.endUtc, ctxAfter).length === 0) {
      throw new ScheduleError("VERIFY_FAILED", "L'occurrence n'a pas pu être rebloquée. Rien n'a été modifié.");
    }
    return { ok: true, message: `${seriesLabel(series)} : occurrence du ${frDate(occurrenceDate)} de nouveau bloquée.` };
  });
}

/**
 * Déplace UNE occurrence (exception MOVE). Pour une occurrence portée par une
 * réservation réelle, renvoie BOOKING_BACKED + bookingId : l'appelant
 * reprogramme la réservation (emails + Google), et l'ancien créneau est
 * libéré automatiquement (état dérivé).
 * `keepOriginalBlocked` : pose en plus un blocage manuel sur l'ancien horaire
 * (volonté explicite de garder ce créneau indisponible).
 */
export async function moveOccurrence(db, input) {
  const { recurringBlockId, occurrenceDate, newStartUtc, newEndUtc } = input;
  if (!(newStartUtc instanceof Date) || !(newEndUtc instanceof Date) || newEndUtc <= newStartUtc) {
    return { ok: false, code: "INVALID", error: "Nouvel horaire invalide." };
  }
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, recurringBlockId);
    const { occurrence } = await loadOccurrence(tx, series, occurrenceDate);
    if (occurrence.state === "booked") {
      throw new ScheduleError("BOOKING_BACKED", "Occurrence portée par une réservation.", { bookingId: occurrence.bookingId });
    }

    const ctx = await loadAround(tx, newStartUtc, newEndUtc);
    const ownSeries = (b) => b.kind === "recurring" && b.recurringBlockId === recurringBlockId && b.occurrenceDate === occurrenceDate;
    const blockers = findBlockers(newStartUtc, newEndUtc, ctx).filter((b) => !ownSeries(b));
    const booking = blockers.find((b) => b.kind === "booking");
    if (booking) {
      throw new ScheduleError(
        "BOOKING_CONFLICT",
        `Impossible de déplacer vers le ${frDateTime(newStartUtc)} : ${booking.label} occupe déjà ce créneau.`,
        { blockers }
      );
    }

    await tx.recurringBlockException.upsert({
      where: { recurringBlockId_occurrenceDate: { recurringBlockId, occurrenceDate: isoDateToDbDate(occurrenceDate) } },
      create: {
        recurringBlockId,
        occurrenceDate: isoDateToDbDate(occurrenceDate),
        type: "MOVE",
        newStartAt: newStartUtc,
        newEndAt: newEndUtc,
        note: input.note ?? null
      },
      update: { type: "MOVE", newStartAt: newStartUtc, newEndAt: newEndUtc, bookingId: null, note: input.note ?? null }
    });

    if (input.keepOriginalBlocked) {
      const local = DateTime.fromJSDate(occurrence.startUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
      const localEnd = DateTime.fromJSDate(occurrence.endUtc, { zone: "utc" }).setZone(BRUSSELS_TZ);
      await tx.availabilityOverride.create({
        data: {
          date: local.startOf("day").toUTC().toJSDate(),
          startTime: local.toFormat("HH:mm"),
          endTime: localEnd.toISODate() !== local.toISODate() ? "24:00" : localEnd.toFormat("HH:mm"),
          type: "BLOCK",
          note: `Ancien créneau conservé bloqué — ${series.note ?? seriesLabel(series)}`
        }
      });
    }

    // Vérification : nouvel horaire bloqué, ancien libre (sauf volonté contraire).
    const after = await loadAround(tx, occurrence.startUtc, newEndUtc > occurrence.endUtc ? newEndUtc : occurrence.endUtc);
    const newBlocked = findBlockers(newStartUtc, newEndUtc, after).some((b) => b.kind === "recurring" && b.recurringBlockId === recurringBlockId);
    const oldStillSeries = findBlockers(occurrence.startUtc, occurrence.endUtc, after).some(
      (b) => b.kind === "recurring" && b.recurringBlockId === recurringBlockId && !b.movedOccurrence
    );
    if (!newBlocked || oldStillSeries) {
      throw new ScheduleError("VERIFY_FAILED", "Le déplacement n'a pas pu être appliqué. Rien n'a été modifié.");
    }
    const warn = blockers.filter((b) => b.kind !== "booking");
    return {
      ok: true,
      message:
        `${seriesLabel(series)} : occurrence du ${frDate(occurrenceDate)} déplacée au ${frDateTime(newStartUtc)}. ` +
        (input.keepOriginalBlocked ? "L'ancien créneau reste bloqué (blocage manuel)." : "L'ancien créneau est libéré.") +
        (warn.length ? ` Attention : le nouvel horaire chevauche aussi « ${warn[0].label} ».` : "")
    };
  });
}

// ─── Série entière / occurrence et suivantes ───────────────────────────────

function validatePattern(input) {
  const dayOfWeek = Number(input.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) throw new ScheduleError("INVALID", "Jour invalide.");
  const startMin = toMinutes(input.startTime);
  const endMin = toMinutes(input.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) throw new ScheduleError("INVALID", "Plage horaire invalide.");
  const timeZone = input.timeZone === MIAMI_TZ ? MIAMI_TZ : BRUSSELS_TZ;
  if (input.timeZone && input.timeZone !== MIAMI_TZ && input.timeZone !== BRUSSELS_TZ) {
    throw new ScheduleError("INVALID", "Fuseau horaire invalide.");
  }
  return { dayOfWeek, startTime: minutesToTime(startMin), endTime: minutesToTime(endMin), timeZone };
}

/** Plan de déplacement des réservations liées à une série. */
async function planLinkedBookingMoves(tx, series, pattern, fromDateIso, now) {
  const delta = pattern.dayOfWeek - series.dayOfWeek;
  const linked = await tx.booking.findMany({
    where: { recurringBlockId: series.id, occurrenceDate: { gte: isoDateToDbDate(fromDateIso) } },
    include: { client: { select: { name: true } } }
  });
  const target = { ...series, ...pattern };
  const moves = [];
  const relinks = [];
  for (const booking of linked) {
    const occIso = toIsoDateOnly(booking.occurrenceDate);
    if (!occIso) continue;
    const newOccIso = addDaysIso(occIso, delta);
    const original = occurrenceInterval(series, occIso);
    const onOccurrence =
      booking.status === "CONFIRMED" &&
      original &&
      Math.abs(booking.startAt.getTime() - original.startUtc.getTime()) < 60000 &&
      booking.startAt.getTime() >= now.getTime();
    if (onOccurrence) {
      const next = occurrenceInterval(target, newOccIso);
      if (!next) throw new ScheduleError("INVALID", `Horaire inexistant le ${frDate(newOccIso)} (changement d'heure).`);
      moves.push({ booking, newOccIso, startUtc: next.startUtc, endUtc: next.endUtc });
    } else {
      relinks.push({ booking, newOccIso });
    }
  }
  return { delta, moves, relinks };
}

async function assertMovesFree(tx, moves) {
  const movingIds = new Set(moves.map((m) => m.booking.id));
  const conflicts = [];
  for (const move of moves) {
    const ctx = await loadAround(tx, move.startUtc, move.endUtc);
    const blocking = findBlockers(move.startUtc, move.endUtc, ctx).filter(
      (b) => b.kind === "booking" && !movingIds.has(b.bookingId)
    );
    if (blocking.length > 0) conflicts.push(`${frDateTime(move.startUtc)} (${blocking[0].label})`);
  }
  if (conflicts.length > 0) {
    throw new ScheduleError(
      "BOOKING_CONFLICT",
      `Modification refusée : ${conflicts.length} rendez-vous de la série tomberaient sur une réservation existante : ${conflicts.slice(0, 5).join(" ; ")}${conflicts.length > 5 ? " ; …" : ""}. Rien n'a été modifié.`,
      { conflicts }
    );
  }
}

async function applyMoves(tx, moves, recurringBlockId) {
  for (const move of moves) {
    await tx.booking.update({
      where: { id: move.booking.id },
      data: {
        startAt: move.startUtc,
        endAt: move.endUtc,
        recurringBlockId,
        occurrenceDate: isoDateToDbDate(move.newOccIso),
        // Changement local pas encore poussé vers Google : la synchro le
        // reprendra (et ne l'écrasera pas avec l'ancienne version Google).
        syncStatus: "pending"
      }
    });
  }
}

/**
 * Modifie une série.
 *  - scope "all"       : toute la série (horaire/jour/fuseau/note) ;
 *  - scope "following" : à partir de `fromDate` (une date d'occurrence) : la
 *    série d'origine s'arrête la veille, une nouvelle série reprend avec le
 *    nouveau motif.
 * Les réservations liées futures qui sont sur leur occurrence suivent le
 * nouveau motif (tout ou rien : refus si l'une tomberait sur une réservation
 * existante). Les réservations déplacées individuellement restent à leur
 * horaire. Renvoie `movedBookingIds` (à pousser vers Google).
 */
export async function updateSeries(db, input) {
  const now = input.now ?? new Date();
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, input.recurringBlockId);
    const pattern = validatePattern({
      dayOfWeek: input.dayOfWeek ?? series.dayOfWeek,
      startTime: input.startTime ?? series.startTime,
      endTime: input.endTime ?? series.endTime,
      timeZone: input.timeZone ?? seriesZone(series)
    });
    const note = input.note === undefined ? series.note : input.note || null;
    const todayIso = isoDateInZone(now, seriesZone(series));

    const fromDate = input.fromDate;
    if (
      input.scope === "following" &&
      (!isIsoDate(fromDate) || weekdayOfIso(fromDate) !== series.dayOfWeek || !isWithinSeriesPeriod(series, fromDate))
    ) {
      throw new ScheduleError("INVALID", "Choisissez une date d'occurrence de la série comme point de départ.");
    }
    // « Cette occurrence et les suivantes » depuis la toute première
    // occurrence = toute la série.
    const splitNeeded = input.scope === "following" && !(series.startDate && series.startDate >= fromDate);
    if (splitNeeded) {
      const plan = await planLinkedBookingMoves(tx, series, pattern, fromDate, now);
      await assertMovesFree(tx, plan.moves);

      const newStart = addDaysIso(fromDate, plan.delta);
      const previousEnd = addDaysIso(fromDate, -1);
      const created = await tx.recurringBlock.create({
        data: {
          ...pattern,
          clientId: series.clientId,
          note,
          startDate: isoDateToDbDate(newStart),
          endDate: series.endDate ? isoDateToDbDate(addDaysIso(series.endDate, plan.delta)) : null
        }
      });
      await tx.recurringBlock.update({ where: { id: series.id }, data: { endDate: isoDateToDbDate(previousEnd) } });
      // Exceptions à partir de la date : transférées sur la nouvelle série.
      const exceptions = await tx.recurringBlockException.findMany({
        where: { recurringBlockId: series.id, occurrenceDate: { gte: isoDateToDbDate(fromDate) } }
      });
      for (const exception of exceptions) {
        await tx.recurringBlockException.update({
          where: { id: exception.id },
          data: {
            recurringBlockId: created.id,
            occurrenceDate: isoDateToDbDate(addDaysIso(toIsoDateOnly(exception.occurrenceDate), plan.delta))
          }
        });
      }
      await applyMoves(tx, plan.moves, created.id);
      for (const relink of plan.relinks) {
        await tx.booking.update({
          where: { id: relink.booking.id },
          data: { recurringBlockId: created.id, occurrenceDate: isoDateToDbDate(relink.newOccIso) }
        });
      }
      return {
        ok: true,
        message: `Série modifiée à partir du ${frDate(fromDate)} : ${pattern.startTime}-${pattern.endTime} (${pattern.timeZone === MIAMI_TZ ? "Miami" : "Bruxelles"}). ${plan.moves.length} rendez-vous déplacé${plan.moves.length > 1 ? "s" : ""}, les occurrences précédentes sont inchangées.`,
        movedBookingIds: plan.moves.map((m) => m.booking.id),
        newRecurringBlockId: created.id
      };
    }

    // scope "all"
    const plan = await planLinkedBookingMoves(tx, series, pattern, todayIso, now);
    await assertMovesFree(tx, plan.moves);
    await tx.recurringBlock.update({
      where: { id: series.id },
      data: {
        ...pattern,
        note,
        startDate: series.startDate ? isoDateToDbDate(addDaysIso(series.startDate, plan.delta)) : null,
        endDate: series.endDate ? isoDateToDbDate(addDaysIso(series.endDate, plan.delta)) : null
      }
    });
    if (plan.delta !== 0) {
      // Décalage des exceptions futures sur le nouveau jour (même semaine).
      // Ordre de mise à jour choisi pour ne jamais heurter la contrainte unique.
      const exceptions = await tx.recurringBlockException.findMany({
        where: { recurringBlockId: series.id },
        orderBy: { occurrenceDate: plan.delta > 0 ? "desc" : "asc" }
      });
      for (const exception of exceptions) {
        await tx.recurringBlockException.update({
          where: { id: exception.id },
          data: { occurrenceDate: isoDateToDbDate(addDaysIso(toIsoDateOnly(exception.occurrenceDate), plan.delta)) }
        });
      }
    }
    await applyMoves(tx, plan.moves, series.id);
    for (const relink of plan.relinks) {
      await tx.booking.update({
        where: { id: relink.booking.id },
        data: { occurrenceDate: isoDateToDbDate(relink.newOccIso) }
      });
    }
    return {
      ok: true,
      message: `Série entière modifiée : ${pattern.startTime}-${pattern.endTime} (${pattern.timeZone === MIAMI_TZ ? "Miami" : "Bruxelles"}). ${plan.moves.length} rendez-vous à venir déplacé${plan.moves.length > 1 ? "s" : ""}.`,
      movedBookingIds: plan.moves.map((m) => m.booking.id)
    };
  });
}

/**
 * Arrête une série à partir d'une date (« supprimer cette occurrence et les
 * suivantes »). La série reste en place avant la date. Renvoie les
 * réservations futures liées à annuler (emails + Google par l'appelant).
 */
export async function endSeriesFrom(db, input) {
  const now = input.now ?? new Date();
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, input.recurringBlockId);
    const fromDate = input.fromDate;
    if (!isIsoDate(fromDate)) throw new ScheduleError("INVALID", "Date invalide.");
    const lastKept = addDaysIso(fromDate, -1);
    if (series.startDate && lastKept < series.startDate) {
      throw new ScheduleError("WHOLE_SERIES", "Cette date est la première de la série : utilisez « Supprimer toute la série ».");
    }
    await tx.recurringBlock.update({ where: { id: series.id }, data: { endDate: isoDateToDbDate(lastKept) } });
    const toCancel = await tx.booking.findMany({
      where: {
        recurringBlockId: series.id,
        status: "CONFIRMED",
        occurrenceDate: { gte: isoDateToDbDate(fromDate) },
        startAt: { gte: now }
      },
      select: { id: true }
    });
    return {
      ok: true,
      message: `${seriesLabel(series)} : série arrêtée à partir du ${frDate(fromDate)} (dernière occurrence conservée : semaine du ${frDate(lastKept)}).${toCancel.length ? ` ${toCancel.length} rendez-vous à venir vont être annulés.` : ""}`,
      bookingsToCancel: toCancel.map((b) => b.id)
    };
  });
}

/**
 * Borne une série à une période (dates incluses, null = sans limite).
 * Refuse si des réservations liées à venir tomberaient hors période, sauf
 * `cancelOutside: true` (elles sont alors renvoyées pour annulation).
 */
export async function setSeriesPeriod(db, input) {
  const now = input.now ?? new Date();
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;
  if ((startDate && !isIsoDate(startDate)) || (endDate && !isIsoDate(endDate))) {
    return { ok: false, code: "INVALID", error: "Dates de période invalides." };
  }
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, code: "INVALID", error: "La fin de période doit être après le début." };
  }
  return runScheduleTransaction(db, async (tx) => {
    const series = await loadSeries(tx, input.recurringBlockId);
    const linked = await tx.booking.findMany({
      where: { recurringBlockId: series.id, status: "CONFIRMED", startAt: { gte: now } },
      select: { id: true, occurrenceDate: true, startAt: true }
    });
    const outside = linked.filter((b) => {
      const iso = toIsoDateOnly(b.occurrenceDate);
      return iso && ((startDate && iso < startDate) || (endDate && iso > endDate));
    });
    if (outside.length > 0 && !input.cancelOutside) {
      throw new ScheduleError(
        "BOOKINGS_OUTSIDE",
        `${outside.length} rendez-vous réservé${outside.length > 1 ? "s" : ""} de cette série tomberai${outside.length > 1 ? "ent" : "t"} hors de la nouvelle période (premier : ${frDateTime(outside[0].startAt)}). Cochez « annuler aussi ces rendez-vous » pour confirmer, ou gardez-les en ajustant la période.`,
        { outsideBookingIds: outside.map((b) => b.id) }
      );
    }
    await tx.recurringBlock.update({
      where: { id: series.id },
      data: {
        startDate: startDate ? isoDateToDbDate(startDate) : null,
        endDate: endDate ? isoDateToDbDate(endDate) : null
      }
    });
    const periodLabel =
      startDate && endDate
        ? `du ${frDate(startDate)} au ${frDate(endDate)}`
        : startDate
          ? `à partir du ${frDate(startDate)}`
          : endDate
            ? `jusqu'au ${frDate(endDate)}`
            : "sans limite";
    return {
      ok: true,
      message: `${seriesLabel(series)} : période ${periodLabel}. Hors de cette période, le créneau est libre.${outside.length ? ` ${outside.length} rendez-vous vont être annulés.` : ""}`,
      bookingsToCancel: outside.map((b) => b.id)
    };
  });
}

/**
 * Liste des occurrences à venir d'une série avec leur état (écran admin).
 */
export async function listSeriesOccurrences(db, recurringBlockId, fromUtc, weeks = 12) {
  const series = await loadSeries(db, recurringBlockId);
  const toUtc = new Date(fromUtc.getTime() + weeks * 7 * DAY_MS);
  const ctx = await loadAvailabilityData(db, fromUtc, toUtc);
  const own = ctx.recurringBlocks.find((b) => b.id === recurringBlockId) ?? series;
  return expandSeries(own, ctx, fromUtc, toUtc).map((o) => ({
    dateIso: o.dateIso,
    startUtc: o.startUtc,
    endUtc: o.endUtc,
    state: o.state,
    reason: o.reason,
    bookingId: o.bookingId,
    movedTo: o.movedTo
  }));
}

/**
 * Pose une indisponibilité explicite (exception BLOCK) sur une plage
 * (heure de Bruxelles). Utilisé pour « garder ce créneau bloqué ».
 */
export async function addManualBlock(db, input) {
  const { dateIso, startTime, endTime } = input;
  if (!isIsoDate(dateIso)) return { ok: false, code: "INVALID", error: "Date invalide." };
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return { ok: false, code: "INVALID", error: "Plage horaire invalide." };
  }
  return runScheduleTransaction(db, async (tx) => {
    const day = DateTime.fromISO(dateIso, { zone: BRUSSELS_TZ }).startOf("day");
    const created = await tx.availabilityOverride.create({
      data: {
        date: day.toUTC().toJSDate(),
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(endMin),
        type: "BLOCK",
        note: input.note || null
      }
    });
    return { ok: true, message: `Créneau ${startTime}-${endTime} bloqué le ${frDate(dateIso)}.`, overrideId: created.id };
  });
}
