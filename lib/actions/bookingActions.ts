"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { getClientSession } from "../session";
import { cancelBooking, ensureManageTokenForBooking } from "../booking";

const MANAGE_WINDOW_MS = 72 * 60 * 60 * 1000;

async function getOwnedBooking(bookingId: number, clientId: number) {
  return prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId,
      status: { not: "CANCELLED" }
    }
  });
}

function isManageable(startAt: Date) {
  return startAt.getTime() - Date.now() > MANAGE_WINDOW_MS;
}

export async function cancelClientBookingAction(formData: FormData) {
  const session = getClientSession();
  if (!session) redirect("/login");

  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) redirect("/manage?error=Rendez-vous%20introuvable");

  const booking = await getOwnedBooking(bookingId, session.clientId);
  if (!booking) redirect("/manage?error=Rendez-vous%20introuvable");
  if (!isManageable(booking.startAt)) {
    redirect("/manage?error=Modification%20impossible%20(moins%20de%2072h)");
  }

  const result = await cancelBooking(booking.id);
  if (result && "error" in result && result.error) {
    redirect(`/manage?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/manage");
  redirect("/manage");
}

export async function manageClientBookingAction(formData: FormData) {
  const session = getClientSession();
  if (!session) redirect("/login");

  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) redirect("/manage?error=Rendez-vous%20introuvable");

  const booking = await getOwnedBooking(bookingId, session.clientId);
  if (!booking) redirect("/manage?error=Rendez-vous%20introuvable");
  if (!isManageable(booking.startAt)) {
    redirect("/manage?error=Modification%20impossible%20(moins%20de%2072h)");
  }

  const tokenResult = await ensureManageTokenForBooking(booking.id);
  if ("error" in tokenResult) {
    redirect("/manage?error=Rendez-vous%20introuvable");
  }

  redirect(`/rdv/manage/${tokenResult.token}`);
}
