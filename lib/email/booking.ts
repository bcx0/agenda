import { Resend } from "resend";
import { prisma } from "../prisma";

const DEFAULT_TZ = "Europe/Brussels";
const PROVIDER = "resend";

export type BookingEmailType =
  | "booking_confirmed"
  | "booking_updated"
  | "booking_cancelled";

export type BookingEmailParams = {
  bookingId: number;
  clientName: string;
  clientEmail: string;
  startAt: Date;
  endAt: Date;
  timeZone?: string | null;
  oldStartAt?: Date | null;
  oldEndAt?: Date | null;
  manageUrl?: string | null;
};

function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short"
  }).format(date);
}

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    timeStyle: "short"
  }).format(date);
}

function buildSlotLine(startAt: Date, endAt: Date, timeZone: string) {
  const startLabel = formatDateTime(startAt, timeZone);
  const endLabel = formatTime(endAt, timeZone);
  return `${startLabel} → ${endLabel} (${timeZone})`;
}

function buildAppLink(path: string) {
  const base = process.env.APP_URL;
  if (!base) return "";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function alreadySent(bookingId: number, type: BookingEmailType, to: string) {
  const bookingIdToken = `"bookingId":${bookingId}`;
  return prisma.emailLog.findFirst({
    where: {
      to,
      AND: [
        { body: { contains: `"type":"${type}"` } },
        { body: { contains: bookingIdToken } },
        { body: { contains: `"status":"sent"` } }
      ]
    }
  });
}

async function sendBookingEmail(params: {
  type: BookingEmailType;
  subject: string;
  html: string;
  booking: BookingEmailParams;
}) {
  const { type, subject, html, booking } = params;

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  const baseLog = {
    type,
    bookingId: booking.bookingId,
    status: "pending",
    provider: PROVIDER,
    providerMessageId: null as string | null,
    error: null as string | null,
    to: booking.clientEmail,
    subject,
    html,
    meta: {
      clientName: booking.clientName,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timeZone: booking.timeZone ?? DEFAULT_TZ,
      oldStartAt: booking.oldStartAt ?? null,
      oldEndAt: booking.oldEndAt ?? null
    }
  };

  const log = await prisma.emailLog.create({
    data: {
      to: booking.clientEmail,
      subject,
      body: JSON.stringify(baseLog)
    }
  });

  if (!apiKey || !emailFrom) {
    const errorMessage = "Missing RESEND_API_KEY or EMAIL_FROM.";
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        body: JSON.stringify({
          ...baseLog,
          status: "failed",
          error: errorMessage
        })
      }
    });
    return { ok: false, error: errorMessage };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: booking.clientEmail,
      subject,
      html
    });

    if (error) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          body: JSON.stringify({
            ...baseLog,
            status: "failed",
            error: error.message
          })
        }
      });
      return { ok: false, error: error.message };
    }

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        body: JSON.stringify({
          ...baseLog,
          status: "sent",
          providerMessageId: data?.id ?? null
        })
      }
    });

    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        body: JSON.stringify({
          ...baseLog,
          status: "failed",
          error: message
        })
      }
    });
    return { ok: false, error: message };
  }
}

export async function sendBookingConfirmationEmail(booking: BookingEmailParams) {
  const already = await alreadySent(booking.bookingId, "booking_confirmed", booking.clientEmail);
  if (already) return { ok: true, skipped: true };

  const timeZone = booking.timeZone ?? DEFAULT_TZ;
  const slotLine = buildSlotLine(booking.startAt, booking.endAt, timeZone);
  const link = buildAppLink("/client");
  const manageLink = booking.manageUrl ?? null;

  const subject = "Confirmation de rendez-vous";
  const html = `
    <h1>Reservation confirmee</h1>
    <p>Bonjour ${booking.clientName},</p>
    <p>Votre rendez-vous est confirme.</p>
    <p><strong>${slotLine}</strong></p>
    ${link ? `<p><a href="${link}">Ouvrir l'agenda</a></p>` : ""}
    ${manageLink ? `<p><a href="${manageLink}">Gerer ou modifier ce rendez-vous</a></p>` : ""}
  `;

  return sendBookingEmail({
    type: "booking_confirmed",
    subject,
    html,
    booking
  });
}

export async function sendBookingUpdatedEmail(booking: BookingEmailParams) {
  const already = await alreadySent(booking.bookingId, "booking_updated", booking.clientEmail);
  if (already) return { ok: true, skipped: true };

  const timeZone = booking.timeZone ?? DEFAULT_TZ;
  const slotLine = buildSlotLine(booking.startAt, booking.endAt, timeZone);
  const oldSlotLine =
    booking.oldStartAt && booking.oldEndAt
      ? buildSlotLine(booking.oldStartAt, booking.oldEndAt, timeZone)
      : null;
  const link = buildAppLink("/client");

  const subject = "Modification de rendez-vous";
  const html = `
    <h1>Rendez-vous modifie</h1>
    <p>Bonjour ${booking.clientName},</p>
    <p>Votre rendez-vous a ete mis a jour.</p>
    ${oldSlotLine ? `<p>Ancien creneau : <strong>${oldSlotLine}</strong></p>` : ""}
    <p>Nouveau creneau : <strong>${slotLine}</strong></p>
    ${link ? `<p><a href="${link}">Ouvrir l'agenda</a></p>` : ""}
  `;

  return sendBookingEmail({
    type: "booking_updated",
    subject,
    html,
    booking
  });
}

export async function sendBookingCancelledEmail(booking: BookingEmailParams) {
  const already = await alreadySent(booking.bookingId, "booking_cancelled", booking.clientEmail);
  if (already) return { ok: true, skipped: true };

  const timeZone = booking.timeZone ?? DEFAULT_TZ;
  const slotLine = buildSlotLine(booking.startAt, booking.endAt, timeZone);
  const link = buildAppLink("/client");

  const subject = "Annulation de rendez-vous";
  const html = `
    <h1>Rendez-vous annule</h1>
    <p>Bonjour ${booking.clientName},</p>
    <p>Votre rendez-vous a ete annule.</p>
    <p><strong>${slotLine}</strong></p>
    ${link ? `<p><a href="${link}">Acceder au portail</a></p>` : ""}
  `;

  return sendBookingEmail({
    type: "booking_cancelled",
    subject,
    html,
    booking
  });
}
