import { DateTime } from "luxon";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { BRUSSELS_TZ, MIAMI_TZ, isWithinMiamiWindow, monthBoundsUtc } from "./time";
import { sendBookingConfirmationEmail, sendBookingUpdatedEmail } from "./email/booking";
import { checkSlotAvailability, cancelBooking } from "./booking";
import { makePayloadFromBooking, sendMakeBookingWebhook } from "./makeWebhook";
import { pushBookingToGoogle, pushBlockToGoogle } from "./sync-engine";
import { lockSchedule } from "./schedule-ops.mjs";

export async function listClients() {
  return prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });
}

export async function createClient(input: {
  email: string;
  name: string;
  passwordHash: string;
  creditsPerMonth: number;
}) {
  return prisma.client.create({ data: { ...input, isActive: true } });
}

export async function updateCredits(clientId: number, creditsPerMonth: number) {
  return prisma.client.update({
    where: { id: clientId },
    data: { creditsPerMonth }
  });
}

export async function setClientActive(clientId: number, isActive: boolean) {
  return prisma.client.update({
    where: { id: clientId },
    data: { isActive }
  });
}

export async function deleteClient(clientId: number) {
  // AVANT de supprimer les lignes : retirer du calendrier Google les RDV
  // futurs confirmés de ce client. Sans ça, les événements restaient sur le
  // calendrier et la sync suivante les réimportait en blocs [NO_ACCOUNT]
  // fantômes qui re-bloquaient les créneaux pour toujours.
  const futureSynced = await prisma.booking.findMany({
    where: {
      clientId,
      status: "CONFIRMED",
      googleEventId: { not: null },
      startAt: { gte: new Date() }
    },
    select: { id: true },
    take: 100
  });
  if (futureSynced.length > 0) {
    const results = await Promise.allSettled(
      futureSynced.map((b: { id: number }) => pushBookingToGoogle(b.id, "delete"))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      console.error(
        `[deleteClient] ${failed}/${futureSynced.length} suppression(s) Google échouée(s) — les événements restants seront rattrapés par la réconciliation.`
      );
    }
  }

  // Cascade: delete related records first, then the client
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { clientId } }),
    prisma.recurringBlock.deleteMany({ where: { clientId } }),
    prisma.client.delete({ where: { id: clientId } }),
  ]);
}

export async function listBlocks() {
  return prisma.block.findMany({ orderBy: { startAt: "asc" } });
}

export async function listAvailabilityRules() {
  return prisma.availabilityRule.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
  });
}

export async function createAvailabilityRule(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  location: string = "MIAMI"
) {
  return prisma.availabilityRule.create({
    data: { dayOfWeek, startTime, endTime, location }
  });
}

export async function deleteAvailabilityRule(id: number) {
  return prisma.availabilityRule.delete({ where: { id } });
}

export async function listAvailabilityOverrides() {
  return prisma.availabilityOverride.findMany({
    orderBy: [{ date: "asc" }, { startTime: "asc" }]
  });
}

export async function createAvailabilityOverride(input: {
  date: Date;
  startTime: string;
  endTime: string;
  type: "BLOCK" | "OPEN";
  note?: string;
}) {
  return prisma.availabilityOverride.create({
    data: {
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      type: input.type,
      note: input.note ?? null
    }
  });
}

export async function deleteAvailabilityOverride(id: number) {
  return prisma.availabilityOverride.delete({ where: { id } });
}

export async function listRecurringBlocks() {
  return prisma.recurringBlock.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { client: true }
  });
}

export async function createRecurringBlock(input: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeZone?: string;
  clientId?: number | null;
  note?: string;
}) {
  return prisma.recurringBlock.create({
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone ?? "Europe/Brussels",
      clientId: input.clientId ?? null,
      note: input.note ?? null
    }
  });
}

export async function deleteRecurringBlock(id: number) {
  return prisma.recurringBlock.delete({ where: { id } });
}

export async function createBlock(
  startLocal: string,
  durationMinutes: number,
  reason?: string
) {
  const startInMiami = DateTime.fromISO(startLocal, { zone: MIAMI_TZ });
  const startUtc = startInMiami.toUTC().toJSDate();
  const endUtc = startInMiami.plus({ minutes: durationMinutes }).toUTC().toJSDate();

  if (!isWithinMiamiWindow(startUtc, endUtc)) {
    throw new Error("Blocage hors plage autorisee (07:00-20:00 Miami).");
  }

  const newBlock = await prisma.block.create({
    data: {
      startAt: startUtc,
      endAt: endUtc,
      reason
    }
  });
  pushBlockToGoogle(newBlock.id, "create").catch((err) =>
    console.error("[GoogleSync] Block create failed:", err)
  );
  return newBlock;
}

export async function deleteBlock(
  blockId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Pousser la suppression AVANT d'effacer la ligne : pushBlockToGoogle relit
  // le bloc en base — après le delete il jetait "Block introuvable" et
  // l'événement "Indisponible" restait sur Google Calendar.
  const block = await prisma.block.findUnique({ where: { id: blockId } });
  if (!block) return { ok: true };
  try {
    await pushBlockToGoogle(blockId, "delete");
  } catch (err) {
    console.error("[GoogleSync] Block delete failed:", err);
    // Si l'événement Google n'a pas pu être supprimé, on NE supprime PAS la
    // ligne locale : sinon la synchro suivante réimporterait l'événement
    // comme un nouveau blocage (blocage « fantôme » qui réapparaît).
    if (block.googleEventId) {
      return {
        ok: false,
        error:
          "L'événement n'a pas pu être supprimé de Google Calendar : rien n'a été supprimé (sinon il réapparaîtrait à la prochaine synchro). Réessayez dans un instant."
      };
    }
  }
  await prisma.block.delete({ where: { id: blockId } }).catch(() => undefined);
  return { ok: true };
}

export async function listUpcomingBookingsThisMonth() {
  // Début de journée à Bruxelles (le serveur Vercel tourne en UTC :
  // setHours(0) donnait minuit UTC, soit 01:00/02:00 à Bruxelles).
  const todayStart = DateTime.now().setZone(BRUSSELS_TZ).startOf("day").toJSDate();
  return prisma.booking.findMany({
    where: {
      status: { not: "CANCELLED" },
      startAt: { gte: todayStart }
    },
    orderBy: { startAt: "asc" },
    include: { client: true }
  });
}

export async function countCancelledBookings() {
  return prisma.booking.count({ where: { status: "CANCELLED" } });
}

export async function listEmailLogs() {
  return prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" }
  });
}

export async function adminCancelBooking(id: number) {
  return cancelBooking(id);
}

export async function updateBookingStatus(id: number, status: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };

  if (status === "CANCELLED") {
    return cancelBooking(id);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status }
  });
  if (status === 'CANCELLED') {
    pushBookingToGoogle(updated.id, 'delete').catch((err) =>
      console.error('[GoogleSync] Booking delete failed:', err)
    )
  } else {
    pushBookingToGoogle(updated.id, 'update').catch((err) =>
      console.error('[GoogleSync] Booking update failed:', err)
    )
  }

  if (status === "CONFIRMED" && booking.status !== "CONFIRMED") {
    await sendBookingConfirmationEmail({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels"
    });
  }

  return updated;
}

export async function clientUsageThisMonth() {
  const { startUtc, endUtc } = monthBoundsUtc();
  const grouped = await prisma.booking.groupBy({
    by: ["clientId"],
    where: { status: { not: "CANCELLED" }, startAt: { gte: startUtc, lt: endUtc } },
    _count: { id: true }
  });
  return new Map(grouped.map((g: any) => [g.clientId, g._count.id]));
}

export async function updateBookingMode(id: number, mode: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };

  const updated = await prisma.booking.update({
    where: { id },
    data: { mode }
  });
  pushBookingToGoogle(updated.id, "update").catch((err) =>
    console.error("[GoogleSync] Booking update failed:", err)
  );

  if (mode !== booking.mode) {
    await sendBookingUpdatedEmail({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: "Europe/Brussels"
    });
  }

  return updated;
}

export async function adminRescheduleBooking(
  id: number,
  startLocal: string,
  reason?: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { client: true }
  });
  if (!booking) return { error: "Booking introuvable" };
  if (booking.status === "CANCELLED") {
    return { error: "Ce rendez-vous est annulé." };
  }

  const startBrussels = DateTime.fromISO(startLocal, { zone: BRUSSELS_TZ });
  if (!startBrussels.isValid) {
    return { error: "Créneau invalide." };
  }

  // Conserver la durée d'origine : un RDV importé de Google (ex. 90 min) était
  // ramené en silence à 1 h lors d'une reprogrammation depuis l'admin.
  const originalDurationMs = booking.endAt.getTime() - booking.startAt.getTime();
  const durationMs = originalDurationMs > 0 ? originalDurationMs : 60 * 60 * 1000;
  const startUtc = startBrussels.toUTC().toJSDate();
  const endUtc = new Date(startUtc.getTime() + durationMs);

  const availability = await checkSlotAvailability(startUtc, endUtc, {
    excludeBookingId: booking.id
  });
  if (!availability.ok) {
    return { error: availability.error };
  }

  const oldStartAt = booking.startAt;
  const oldEndAt = booking.endAt;

  // Transaction + re-check de conflit : sans elle, un client pouvait réserver
  // le même créneau entre le checkSlotAvailability ci-dessus et l'update
  // (même protection que le reschedule côté client).
  const updated = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      // Même verrou que les réservations et les actions sur les séries.
      await lockSchedule(tx);
      const conflict = await tx.booking.findFirst({
        where: {
          status: "CONFIRMED",
          id: { not: id },
          startAt: { lt: endUtc },
          endAt: { gt: startUtc }
        },
        select: { id: true }
      });
      if (conflict) throw new Error("SLOT_TAKEN");
      const recheck = await checkSlotAvailability(startUtc, endUtc, { excludeBookingId: booking.id }, tx);
      if (!recheck.ok) throw new Error(recheck.code === "TAKEN" ? "SLOT_TAKEN" : "SLOT_UNAVAILABLE");
      return tx.booking.update({
        where: { id },
        data: {
          startAt: startUtc,
          endAt: endUtc,
          status: "CONFIRMED",
          rescheduleReason: reason ?? booking.rescheduleReason,
          // Changement local pas encore confirmé par Google : la synchro ne
          // l'écrasera pas avec l'ancienne version et le repoussera si besoin.
          syncStatus: "pending"
        }
      });
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message === "SLOT_TAKEN") return "SLOT_TAKEN" as const;
      if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") return "SLOT_UNAVAILABLE" as const;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "SLOT_TAKEN" as const;
      throw err;
    });
  if (updated === "SLOT_TAKEN") {
    return { error: "Ce créneau vient d'être pris." };
  }
  if (updated === "SLOT_UNAVAILABLE") {
    return { error: "Ce créneau n'est plus disponible." };
  }
  // Attendu (et non plus « fire-and-forget ») : sur Vercel, une promesse non
  // attendue peut être coupée après la réponse, et l'app croyait le RDV
  // synchronisé alors que Google gardait l'ancien horaire. En cas d'échec, le
  // RDV reste "pending"/"error" et le cron de synchro le repousse.
  let googleSynced = false;
  try {
    await pushBookingToGoogle(updated.id, "update");
    googleSynced = true;
  } catch (err) {
    console.error("[GoogleSync] Booking update failed:", err);
  }

  void sendMakeBookingWebhook(
    makePayloadFromBooking({
      clientName: booking.client.name,
      service: updated.mode,
      startAt: updated.startAt,
      endAt: updated.endAt,
      notes: updated.rescheduleReason
    })
  );

  await sendBookingUpdatedEmail({
    bookingId: booking.id,
    clientName: booking.client.name,
    clientEmail: booking.client.email,
    startAt: startUtc,
    endAt: endUtc,
    oldStartAt,
    oldEndAt,
    timeZone: "Europe/Brussels"
  });

  return { ok: true, googleSynced };
}

