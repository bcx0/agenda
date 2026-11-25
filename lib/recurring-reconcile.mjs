/**
 * Réconciliation des blocages fantômes DÉJÀ présents en base (25/11/2026).
 *
 * Avant le correctif, déplacer ou annuler un RDV d'une série laissait
 * l'occurrence d'origine bloquée par le RecurringBlock. Les réservations
 * existantes n'étant pas liées à leur série, le nouveau moteur ne peut pas
 * deviner seul lesquelles ont été déplacées. Ce module :
 *
 *  - ANALYSE (lecture seule) chaque occurrence encore bloquante d'une série
 *    client sur l'horizon, et la classe :
 *      · "verified"  : une réservation ANNULÉE du même client existe
 *                      exactement à l'horaire de l'occurrence (annulation
 *                      prouvée). Seul cas appliqué par --apply ;
 *      · "probable"  : aucune réservation à l'horaire, mais UNE réservation
 *                      confirmée non liée du même client existe dans les
 *                      ±14 jours hors motif, et elle n'est candidate pour
 *                      aucune autre occurrence (RDV probablement déplacé). Listé
 *                      pour validation, appliqué seulement si l'admin le
 *                      désigne explicitement ;
 *      · "no_booking": occurrence sans aucune réservation (quota atteint,
 *                      au-delà des 364 jours générés…). Simplement listé ;
 *  - liste les ouvertures « Ajouter un créneau » restées sans effet parce
 *    qu'un bloc récurrent les recouvrait (intention de l'admin) ;
 *  - APPLIQUE uniquement des liens (Booking.recurringBlockId/occurrenceDate)
 *    ou des exceptions SKIP : aucune suppression, tout est réversible.
 */

import {
  BRUSSELS_TZ,
  expandSeries,
  findBlockers,
  isoDateInZone,
  isoDateToDbDate,
  seriesLabel,
  wallTimeToUtc,
  toMinutes
} from "./availability-engine.mjs";
import { loadAvailabilityData } from "./availability-data.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MOVE_WINDOW_DAYS = 14;

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ now?: Date, horizonDays?: number }} [options]
 */
export async function analyzeRecurringGhosts(db, options = {}) {
  const now = options.now ?? new Date();
  const horizonEnd = new Date(now.getTime() + (options.horizonDays ?? 366) * DAY_MS);
  const data = await loadAvailabilityData(db, now, horizonEnd);

  const findings = { verified: [], probable: [], noBooking: [], ineffectiveOpenings: [], series: [] };

  // Réservations non liées (annulées et confirmées) des clients des séries.
  const clientIds = [...new Set(data.recurringBlocks.map((b) => b.clientId).filter(Boolean))];
  const unlinked = clientIds.length
    ? await db.booking.findMany({
        where: {
          clientId: { in: clientIds },
          recurringBlockId: null,
          startAt: { gte: new Date(now.getTime() - 7 * DAY_MS), lt: new Date(horizonEnd.getTime() + 7 * DAY_MS) }
        },
        select: { id: true, clientId: true, startAt: true, endAt: true, status: true, rescheduleReason: true }
      })
    : [];

  for (const series of data.recurringBlocks) {
    const occurrences = expandSeries(series, data, now, horizonEnd);
    findings.series.push({
      id: series.id,
      label: seriesLabel(series),
      clientId: series.clientId,
      clientName: series.clientName,
      startDate: series.startDate,
      endDate: series.endDate,
      activeOccurrences: occurrences.filter((o) => o.state === "active").length,
      bookedOccurrences: occurrences.filter((o) => o.state === "booked").length,
      releasedOccurrences: occurrences.filter((o) => o.state === "released" || o.state === "moved").length
    });
    if (!series.clientId) continue;

    const ownUnlinked = unlinked.filter((b) => b.clientId === series.clientId);
    // Réservations déjà « sur le motif » d'une occurrence (non déplacées).
    const onPattern = new Set();
    for (const occurrence of occurrences) {
      for (const b of ownUnlinked) {
        if (b.status === "CONFIRMED" && b.startAt.getTime() === occurrence.startUtc.getTime()) onPattern.add(b.id);
      }
    }

    // Occurrences encore bloquantes sans réservation à leur horaire.
    const orphans = [];
    for (const occurrence of occurrences) {
      if (occurrence.state !== "active") continue;
      const confirmedHere = findBlockers(occurrence.startUtc, occurrence.endUtc, data).some((b) => b.kind === "booking");
      if (confirmedHere) continue; // une réservation occupe le créneau : pas un fantôme
      const base = {
        recurringBlockId: series.id,
        seriesLabel: seriesLabel(series),
        clientName: series.clientName,
        occurrenceDate: occurrence.dateIso,
        startUtc: occurrence.startUtc
      };
      const cancelledHere = ownUnlinked.find(
        (b) => b.status === "CANCELLED" && b.startAt.getTime() === occurrence.startUtc.getTime()
      );
      if (cancelledHere) {
        findings.verified.push({ ...base, bookingId: cancelledHere.id, evidence: "réservation annulée à l'horaire exact de l'occurrence" });
        continue;
      }
      orphans.push(base);
    }
    // RDV déplacé probable : réservation confirmée non liée, hors motif, du
    // même client, à ±14 jours. Retenu seulement si l'appariement est
    // UNIQUE dans les deux sens (une occurrence ↔ une réservation).
    const offPattern = ownUnlinked.filter((b) => b.status === "CONFIRMED" && !onPattern.has(b.id));
    const near = (o, b) => Math.abs(b.startAt.getTime() - o.startUtc.getTime()) <= MOVE_WINDOW_DAYS * DAY_MS;
    for (const orphan of orphans) {
      const candidates = offPattern.filter((b) => near(orphan, b));
      const unique =
        candidates.length === 1 && orphans.filter((o) => near(o, candidates[0])).length === 1;
      if (unique) {
        findings.probable.push({
          ...orphan,
          bookingId: candidates[0].id,
          bookingStartUtc: candidates[0].startAt,
          evidence: `seule réservation confirmée hors motif du même client à ±${MOVE_WINDOW_DAYS} jours (RDV probablement déplacé)`
        });
      } else {
        findings.noBooking.push({ ...orphan, candidates: candidates.map((c) => c.id) });
      }
    }
  }

  // Ouvertures OPEN qui recouvrent une occurrence active : tentative
  // « Ajouter un créneau » restée sans effet avec l'ancien moteur.
  for (const override of data.overrides) {
    if (override.type !== "OPEN") continue;
    const dateIso = isoDateInZone(override.date, BRUSSELS_TZ);
    const s = toMinutes(override.startTime);
    const e = toMinutes(override.endTime);
    if (s === null || e === null) continue;
    const startUtc = wallTimeToUtc(dateIso, s, BRUSSELS_TZ);
    const endUtc = wallTimeToUtc(dateIso, e, BRUSSELS_TZ);
    if (!startUtc || !endUtc || endUtc <= now) continue;
    for (const blocker of findBlockers(startUtc, endUtc, data)) {
      if (blocker.kind !== "recurring" || blocker.movedOccurrence) continue;
      findings.ineffectiveOpenings.push({
        overrideId: override.id,
        date: dateIso,
        range: `${override.startTime}-${override.endTime}`,
        recurringBlockId: blocker.recurringBlockId,
        occurrenceDate: blocker.occurrenceDate,
        seriesLabel: blocker.label
      });
    }
  }
  return findings;
}

/**
 * Applique des liens réservation → occurrence (réversible : remettre
 * recurringBlockId/occurrenceDate à NULL). Ne touche qu'à des réservations
 * encore non liées.
 * @param {{ recurringBlockId: number, occurrenceDate: string, bookingId: number }[]} links
 */
export async function applyOccurrenceLinks(db, links, source = "reconcile") {
  let applied = 0;
  await db.$transaction(async (tx) => {
    for (const link of links) {
      const { count } = await tx.booking.updateMany({
        where: { id: link.bookingId, recurringBlockId: null },
        data: { recurringBlockId: link.recurringBlockId, occurrenceDate: isoDateToDbDate(link.occurrenceDate) }
      });
      if (count === 1) {
        applied++;
        await tx.syncLog.create({
          data: {
            table: "Booking",
            recordId: link.bookingId,
            action: "reconcile_recurring_link",
            direction: "system",
            details: { recurringBlockId: link.recurringBlockId, occurrenceDate: link.occurrenceDate, source }
          }
        });
      }
    }
  });
  return { applied };
}

/** Libère des occurrences (exceptions SKIP, idempotent). */
export async function applyOccurrenceReleases(db, releases, note) {
  let applied = 0;
  await db.$transaction(async (tx) => {
    for (const release of releases) {
      await tx.recurringBlockException.upsert({
        where: {
          recurringBlockId_occurrenceDate: {
            recurringBlockId: release.recurringBlockId,
            occurrenceDate: isoDateToDbDate(release.occurrenceDate)
          }
        },
        create: {
          recurringBlockId: release.recurringBlockId,
          occurrenceDate: isoDateToDbDate(release.occurrenceDate),
          type: "SKIP",
          note
        },
        update: {}
      });
      applied++;
    }
  });
  return { applied };
}
