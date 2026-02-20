"use server";

import { addHours } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../../../lib/prisma";
import { checkSlotAvailability, cancelBooking } from "../../../../lib/booking";
import { sendBookingUpdatedEmail } from "../../../../lib/email/booking";
import { makePayloadFromBooking, sendMakeBookingWebhook } from "../../../../lib/makeWebhook";

const TOKEN_ERROR = "Lien expiré ou invalide.";

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

  const availability = await checkSlotAvailability(startUtc, endUtc, {
    excludeBookingId: booking.id
  });
  if (!availability.ok) {
    redirect(buildRedirect(token, { error: availability.error }));
  }

  const oldStartAt = booking.startAt;
  const oldEndAt = booking.endAt;

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      startAt: startUtc,
      endAt: endUtc,
      status: "CONFIRMED",
      rescheduleReason: null
    }
  });

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

