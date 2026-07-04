"use server";

import { addHours } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import {
  checkSlotAvailability,
  cancelBooking,
  computeModeForSlot,
  getQuotaStatus
} from "../../../../lib/booking";
import { toMonthKey } from "../../../../lib/time";
import { sendBookingUpdatedEmail } from "../../../../lib/email/booking";
import { makePayloadFromBooking, sendMakeBookingWebhook } from "../../../../lib/makeWebhook";
import { pushBookingToGoogle } from "@/lib/sync-engine";

const TOKEN_ERROR = "Lien expiré ou invalide.";
// Same business rule as /manage (lib/actions/bookingActions.ts): no self-service
// cancellation/modification less than 72h before the session.
const MANAGE_WINDOW_MS = 72 * 60 * 60 * 1000;
const MIN_ADVANCE_MS = 48 * 60 * 60 * 1000;

function buildRedirect(token: string, params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return `/rdv/manage/${token}?${search}`;
}

async function getBookingForToken(token: string) {
  return prisma.booking.findFirst({
    where: {
      manageToken: token,
      manageTokenExpiresAt: { gt: new Date() }
    },
    include: { client: true }
  });
}

export async function cancelAppointmentAction(formData: FormData) {
  const token = formData.get("token")?.toString();

  if (!token) redirect("/rdv/manage/invalid");

  const booking = await getBookingForToken(token);
  if (!booking) {
    redirect(buildRedirect(token, { error: TOKEN_ERROR }));
  }

  if (booking.status === "CANCELLED") {
    redirect(buildRedirect(token, { error: "Ce rendez-vous est déjà annulé." }));
  }

  if (booking.startAt.getTime() - Date.now() <= MANAGE_WINDOW_MS) {
    redirect(
      buildRedirect(token, {
        error: "Annulation impossible à moins de 72h du rendez-vous. Contactez Geoffrey directement."
      })
    );
  }

  const result = await cancelBooking(booking.id);
  if (result && "error" in result && result.error) {
    redirect(buildRedirect(token, { error: result.error }));
  }

  revalidatePath("/admin/bookings");
  redirect(buildRedirect(token, { success: "cancelled" }));
}

export async function rescheduleAppointmentAction(formData: FormData) {
  const token = formData.get("token")?.toString();
  const startIso = formData.get("start")?.toString();

  if (!token) redirect("/rdv/manage/invalid");
  if (!startIso) {
    redirect(buildRedirect(token, { error: "Créneau manquant." }));
  }

  const startUtc = new Date(startIso);
  if (Number.isNaN(startUtc.getTime())) {
    redirect(buildRedirect(token, { error: "Créneau invalide." }));
  }
  const endUtc = addHours(startUtc, 1);

  const booking = await getBookingForToken(token);
  if (!booking) {
    redirect(buildRedirect(token, { error: TOKEN_ERROR }));
  }

  if (booking.status === "CANCELLED") {
    redirect(buildRedirect(token, { error: "Ce rendez-vous est annulé." }));
  }

  // Same 72h rule as cancellation and /manage
  if (booking.startAt.getTime() - Date.now() <= MANAGE_WINDOW_MS) {
    redirect(
      buildRedirect(token, {
        error: "Modification impossible à moins de 72h du rendez-vous. Contactez Geoffrey directement."
      })
    );
  }

  // New slot must respect the 48h advance rule (same as a fresh booking)
  if (startUtc.getTime() - Date.now() < MIN_ADVANCE_MS) {
    redirect(
      buildRedirect(token, {
        error: "Le nouveau créneau doit être au moins 48h à l'avance."
      })
    );
  }

  // Moving to another month must not exceed that month's quota
  if (toMonthKey(startUtc) !== toMonthKey(booking.startAt)) {
    const { creditsPerMonth, creditsUsedThisMonth } = await getQuotaStatus(
      booking.clientId,
      startUtc
    );
    if (creditsUsedThisMonth >= creditsPerMonth) {
      redirect(
        buildRedirect(token, {
          error: "Quota mensuel atteint pour le mois choisi. Contactez Geoffrey."
        })
      );
    }
  }

  const availability = await checkSlotAvailability(startUtc, endUtc, {
    excludeBookingId: booking.id
  });
  if (!availability.ok) {
    redirect(buildRedirect(token, { error: availability.error }));
  }

  const oldStartAt = booking.startAt;
  const oldEndAt = booking.endAt;
  const newMode = await computeModeForSlot(startUtc);

  // Transactional re-check to avoid racing another booking onto the same slot
  const updated = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const conflict = await tx.booking.findFirst({
        where: {
          status: "CONFIRMED",
          id: { not: booking.id },
          startAt: { lt: endUtc },
          endAt: { gt: startUtc }
        }
      });
      if (conflict) throw new Error("SLOT_TAKEN");

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          startAt: startUtc,
          endAt: endUtc,
          status: "CONFIRMED",
          mode: newMode,
          rescheduleReason: null
        }
      });
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message === "SLOT_TAKEN") return null;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    });

  if (!updated) {
    redirect(buildRedirect(token, { error: "Ce créneau vient d'être pris." }));
  }
  pushBookingToGoogle(updated.id, "update").catch((err) =>
    console.error("[GoogleSync] Booking update failed:", err)
  );

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

  revalidatePath("/admin/bookings");
  redirect(buildRedirect(token, { success: "rescheduled" }));
}

