"use server";

import { addHours } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bookSlot, ensureManageTokenForBooking, getUpcomingBookingForClient } from "../../lib/booking";
import { getClientSession } from "../../lib/session";

export async function bookSlotAction(formData: FormData) {
  const session = getClientSession();
  if (!session) redirect("/login");

  const start = formData.get("start")?.toString();
  if (!start) {
    return redirect("/book?error=Créneau%20invalide");
  }

  const startUtc = new Date(start);
  const endUtc = addHours(startUtc, 1);

  const result = await bookSlot(session.clientId, startUtc, endUtc);
  if (result.error) {
    return redirect(`/book?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/book");
  redirect("/book?success=Rendez-vous%20confirme");
}

export async function manageBookingAction() {
  const session = getClientSession();
  if (!session) redirect("/login");

  const booking = await getUpcomingBookingForClient(session.clientId);
  if (!booking) {
    redirect("/book?error=Aucun%20rendez-vous%20%C3%A0%20g%C3%A9rer");
  }

  const msUntil = booking.startAt.getTime() - Date.now();
  if (msUntil <= 72 * 60 * 60 * 1000) {
    redirect("/book?error=Modification%20ou%20annulation%20impossible%20%C3%A0%20moins%20de%2072h");
  }

  const tokenResult = await ensureManageTokenForBooking(booking.id);
  if ("error" in tokenResult) {
    redirect("/book?error=Rendez-vous%20introuvable");
  }

  redirect(`/manage/${tokenResult.token}`);
}
