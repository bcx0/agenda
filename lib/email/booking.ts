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

/** Escapes HTML special chars before interpolating user-provided text (client name). */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function alreadySent(
  bookingId: number,
  type: BookingEmailType,
  to: string,
  startAt?: Date
) {
  const bookingIdToken = `"bookingId":${bookingId}`;
  // For update emails, dedupe per target slot: a booking rescheduled twice
  // must notify the client twice (once per new startAt).
  const startToken = startAt ? `"startAt":"${startAt.toISOString()}"` : null;
  return prisma.emailLog.findFirst({
    where: {
      to,
      AND: [
        { body: { contains: `"type":"${type}"` } },
        { body: { contains: bookingIdToken } },
        { body: { contains: `"status":"sent"` } },
        ...(startToken ? [{ body: { contains: startToken } }] : [])
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
    const errorMessage = `Missing env: RESEND_API_KEY=${apiKey ? "set" : "MISSING"}, EMAIL_FROM=${emailFrom ? "set" : "MISSING"}`;
    console.error("[Email]", errorMessage);
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
      console.error("[Email] Resend API error:", error.message, "to:", booking.clientEmail);
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

    console.log("[Email] Sent successfully:", type, "to:", booking.clientEmail, "id:", data?.id);
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
    console.error("[Email] Exception sending email:", message, "to:", booking.clientEmail);
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
  // "/client" n'existe pas — l'espace client est /manage
  const link = buildAppLink("/manage");
  const manageLink = booking.manageUrl ?? null;

  const subject = "Confirmation de rendez-vous";
  const html = `
    <h1>Réservation confirmée</h1>
    <p>Bonjour ${escapeHtml(booking.clientName)},</p>
    <p>Votre rendez-vous est confirmé.</p>
    <p><strong>${slotLine}</strong></p>
    ${link ? `<p><a href="${link}">Ouvrir l'agenda</a></p>` : ""}
    ${manageLink ? `<p><a href="${manageLink}">Gérer ou modifier ce rendez-vous</a></p>` : ""}
  `;

  return sendBookingEmail({
    type: "booking_confirmed",
    subject,
    html,
    booking
  });
}

export async function sendBookingUpdatedEmail(booking: BookingEmailParams) {
  // Dedupe per (booking, new slot): a second reschedule must send a new email.
  const already = await alreadySent(
    booking.bookingId,
    "booking_updated",
    booking.clientEmail,
    booking.startAt
  );
  if (already) return { ok: true, skipped: true };

  const timeZone = booking.timeZone ?? DEFAULT_TZ;
  const slotLine = buildSlotLine(booking.startAt, booking.endAt, timeZone);
  const oldSlotLine =
    booking.oldStartAt && booking.oldEndAt
      ? buildSlotLine(booking.oldStartAt, booking.oldEndAt, timeZone)
      : null;
  // "/client" n'existe pas — l'espace client est /manage
  const link = buildAppLink("/manage");

  const subject = "Modification de rendez-vous";
  const html = `
    <h1>Rendez-vous modifié</h1>
    <p>Bonjour ${escapeHtml(booking.clientName)},</p>
    <p>Votre rendez-vous a été mis à jour.</p>
    ${oldSlotLine ? `<p>Ancien créneau : <strong>${oldSlotLine}</strong></p>` : ""}
    <p>Nouveau créneau : <strong>${slotLine}</strong></p>
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
  const bookLink = buildAppLink("/book");

  const subject = "Annulation de votre rendez-vous avec Geoffrey";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="font-size: 22px; color: #111;">Rendez-vous annulé</h1>
      <p>Bonjour ${escapeHtml(booking.clientName)},</p>
      <p>Votre rendez-vous prévu le :</p>
      <p style="background: #f8f5f0; border-left: 4px solid #C8A060; padding: 12px 16px; font-weight: 600;">
        ${slotLine}
      </p>
      <p>a été annulé.</p>
      <p>Pas d'inquiétude ! Vous pouvez dès maintenant réserver un nouveau créneau directement depuis votre espace client.</p>
      ${bookLink ? `
      <p style="text-align: center; margin: 24px 0;">
        <a href="${bookLink}" style="display: inline-block; background: #C8A060; color: #000; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Réserver un nouveau créneau →
        </a>
      </p>
      ` : ""}
      <p style="color: #666; font-size: 14px;">Si vous avez des questions, n'hésitez pas à contacter Geoffrey directement.</p>
      <p style="color: #666; font-size: 14px;">À bientôt,<br/>L'équipe Geoffrey Mahieu</p>
    </div>
  `;

  return sendBookingEmail({
    type: "booking_cancelled",
    subject,
    html,
    booking
  });
}
