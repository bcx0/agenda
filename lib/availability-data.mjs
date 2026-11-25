/**
 * Chargement des données du moteur de disponibilité (lib/availability-engine.mjs).
 *
 * Une seule fonction, utilisée par l'admin, l'interface client, la vérification
 * serveur et les tests : tout le monde calcule sur EXACTEMENT les mêmes
 * données. `db` est un client Prisma (injecté pour que les tests puissent
 * utiliser une base isolée).
 *
 * Aucune donnée n'est mise en cache ici : chaque appel relit la base (la
 * disponibilité affichée ne peut pas être plus ancienne que la requête).
 */

import { toIsoDateOnly, isoDateToDbDate, addDaysIso, isoDateInZone, BRUSSELS_TZ } from "./availability-engine.mjs";

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {Date} rangeStartUtc
 * @param {Date} rangeEndUtc
 */
export async function loadAvailabilityData(db, rangeStartUtc, rangeEndUtc) {
  // Marge de 2 jours : les fuseaux (Miami/Bruxelles) décalent les dates.
  const marginStart = new Date(rangeStartUtc.getTime() - 2 * 24 * 60 * 60 * 1000);
  const marginEnd = new Date(rangeEndUtc.getTime() + 2 * 24 * 60 * 60 * 1000);
  const dateFrom = isoDateToDbDate(addDaysIso(isoDateInZone(rangeStartUtc, BRUSSELS_TZ), -2));
  const dateTo = isoDateToDbDate(addDaysIso(isoDateInZone(rangeEndUtc, BRUSSELS_TZ), 2));

  const [rules, overrides, recurringBlocks, exceptions, seriesBookings, blocks, bookings, locationPeriods] =
    await Promise.all([
      db.availabilityRule.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
      db.availabilityOverride.findMany({
        where: { date: { gte: marginStart, lt: marginEnd } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }]
      }),
      db.recurringBlock.findMany({
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        include: { client: { select: { id: true, name: true } } }
      }),
      db.recurringBlockException.findMany({
        where: {
          OR: [
            { occurrenceDate: { gte: dateFrom, lte: dateTo } },
            { newStartAt: { lt: marginEnd }, newEndAt: { gt: marginStart } }
          ]
        }
      }),
      db.booking.findMany({
        where: {
          recurringBlockId: { not: null },
          occurrenceDate: { gte: dateFrom, lte: dateTo }
        },
        select: {
          id: true,
          recurringBlockId: true,
          occurrenceDate: true,
          startAt: true,
          endAt: true,
          status: true
        }
      }),
      db.block.findMany({
        where: { startAt: { lt: marginEnd }, endAt: { gt: marginStart } },
        orderBy: { startAt: "asc" }
      }),
      db.booking.findMany({
        where: { status: "CONFIRMED", startAt: { lt: marginEnd }, endAt: { gt: marginStart } },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          clientId: true,
          recurringBlockId: true,
          occurrenceDate: true,
          client: { select: { name: true } }
        }
      }),
      db.locationPeriod.findMany({ orderBy: { startDate: "asc" } })
    ]);

  return {
    rules,
    overrides,
    locationPeriods,
    recurringBlocks: recurringBlocks.map((block) => ({
      ...block,
      startDate: toIsoDateOnly(block.startDate),
      endDate: toIsoDateOnly(block.endDate),
      clientName: block.client?.name ?? null
    })),
    exceptions: exceptions.map((exception) => ({
      ...exception,
      occurrenceDate: toIsoDateOnly(exception.occurrenceDate)
    })),
    seriesBookings: seriesBookings.map((booking) => ({
      ...booking,
      occurrenceDate: toIsoDateOnly(booking.occurrenceDate)
    })),
    blocks,
    bookings: bookings.map((booking) => ({
      ...booking,
      occurrenceDate: toIsoDateOnly(booking.occurrenceDate),
      clientName: booking.client?.name ?? null
    }))
  };
}
