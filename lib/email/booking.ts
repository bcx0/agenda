import nodemailer, { Transporter } from "nodemailer";
import { prisma } from "../prisma";

const DEFAULT_TZ = "Europe/Brussels";
const PROVIDER = "smtp";

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

/* ───────────────────────────────────────────────────────────────
   SMTP transporter — singleton (Vercel serverless friendly)
   Gmail SMTP via App Password : 2FA must be enabled on the account.
   ─────────────────────────────────────────────────────────────── */
let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL ; 587 = STARTTLS
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 50
  });

  return _transporter;
}

/* ───────────────────────────────────────────────────────────────
   Date helpers
   ─────────────────────────────────────────────────────────────── */
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

function buildLogoUrl() {
  const base = process.env.APP_URL;
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/geoffrey-logo.png`;
}

/* ───────────────────────────────────────────────────────────────
   Idempotence — based on EmailLog body markers
   ─────────────────────────────────────────────────────────────── */
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

/* ───────────────────────────────────────────────────────────────
   Core sender
   ─────────────────────────────────────────────────────────────── */
async function sendBookingEmail(params: {
  type: BookingEmailType;
  subject: string;
  html: string;
  booking: BookingEmailParams;
}) {
  const { type, subject, html, booking } = params;

  const emailFrom = process.env.EMAIL_FROM;
  const transporter = getTransporter();

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

  if (!transporter || !emailFrom) {
    const missing: string[] = [];
    if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
    if (!process.env.SMTP_USER) missing.push("SMTP_USER");
    if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");
    if (!emailFrom) missing.push("EMAIL_FROM");
    const errorMessage = `Missing env: ${missing.join(", ")}`;
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
    const info = await transporter.sendMail({
      from: emailFrom,
      to: booking.clientEmail,
      subject,
      html
    });

    console.log("[Email] Sent successfully:", type, "to:", booking.clientEmail, "id:", info.messageId);
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        body: JSON.stringify({
          ...baseLog,
          status: "sent",
          providerMessageId: info.messageId ?? null
        })
      }
    });

    return { ok: true, id: info.messageId };
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

/* ───────────────────────────────────────────────────────────────
   Template wrapper — adds Geoffrey's logo to every email
   ─────────────────────────────────────────────────────────────── */
function wrapWithBranding(innerHtml: string) {
  const logo = buildLogoUrl();
  const logoBlock = logo
    ? `<div style="text-align:center;padding:24px 0 16px;">
         <img src="${logo}" alt="Geoffrey Mahieu" style="height:56px;width:auto;display:inline-block;" />
       </div>`
    : "";

  return `
<div style="background:#0B0B0B;padding:24px 12px;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E5E5E5;">
    ${logoBlock}
    <div style="padding:8px 32px 32px;color:#1A1A1A;">
      ${innerHtml}
    </div>
    <div style="padding:16px 32px 24px;border-top:1px solid #F0F0F0;text-align:center;color:#888;font-size:12px;">
      © Geoffrey Mahieu — Coach Mental International
    </div>
  </div>
</div>`;
}

/* ───────────────────────────────────────────────────────────────
   Public API — signatures inchangées par rapport à la version Resend
   ─────────────────────────────────────────────────────────────── */
export async function sendBookingConfirmationEmail(booking: BookingEmailParams) {
  const already = await alreadySent(booking.bookingId, "booking_confirmed", booking.clientEmail);
  if (already) return { ok: true, skipped: true };

  const timeZone = booking.timeZone ?? DEFAULT_TZ;
  const slotLine = buildSlotLine(booking.startAt, booking.endAt, timeZone);
  const link = buildAppLink("/client");
  const manageLink = booking.manageUrl ?? null;

  const subject = "Confirmation de rendez-vous";
  const inner = `
    <h1 style="font-size:22px;color:#111;margin:0 0 16px;">Réservation confirmée</h1>
    <p style="margin:0 0 12px;">Bonjour ${booking.clientName},</p>
    <p style="margin:0 0 12px;">Votre rendez-vous est confirmé.</p>
    <p style="background:#F8F5F0;border-left:4px solid #C8A060;padding:12px 16px;font-weight:600;margin:16px 0;">
      ${slotLine}
    </p>
    ${link ? `<p style="margin:16px 0;"><a href="${link}" style="color:#C8A060;">Ouvrir l'agenda</a></p>` : ""}
    ${manageLink ? `<p style="margin:16px 0;"><a href="${manageLink}" style="color:#C8A060;">Gérer ou modifier ce rendez-vous</a></p>` : ""}
  `;

  return sendBookingEmail({
    type: "booking_confirmed",
    subject,
    html: wrapWithBranding(inner),
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

  const subject = "Modification de votre rendez-vous avec Geoffrey";
  const inner = `
    <h1 style="font-size:22px;color:#111;margin:0 0 16px;">Rendez-vous modifié</h1>
    <p style="margin:0 0 12px;">Bonjour ${booking.clientName},</p>
    <p style="margin:0 0 12px;">Votre rendez-vous a été déplacé.</p>
    ${
      oldSlotLine
        ? `<p style="margin:0 0 8px;color:#666;text-decoration:line-through;">${oldSlotLine}</p>`
        : ""
    }
    <p style="background:#F8F5F0;border-left:4px solid #C8A060;padding:12px 16px;font-weight:600;margin:8px 0 16px;">
      ${slotLine}
    </p>
    ${link ? `<p style="margin:16px 0;"><a href="${link}" style="color:#C8A060;">Ouvrir l'agenda</a></p>` : ""}
    <p style="color:#666;font-size:14px;margin:16px 0 0;">Si ce changement ne vous convient pas, contactez Geoffrey directement.</p>
  `;

  return sendBookingEmail({
    type: "booking_updated",
    subject,
    html: wrapWithBranding(inner),
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
  const inner = `
    <h1 style="font-size:22px;color:#111;margin:0 0 16px;">Rendez-vous annulé</h1>
    <p style="margin:0 0 12px;">Bonjour ${booking.clientName},</p>
    <p style="margin:0 0 12px;">Votre rendez-vous prévu le :</p>
    <p style="background:#F8F5F0;border-left:4px solid #C8A060;padding:12px 16px;font-weight:600;margin:16px 0;">
      ${slotLine}
    </p>
    <p style="margin:0 0 12px;">a été annulé.</p>
    <p style="margin:0 0 16px;">Pas d'inquiétude — vous pouvez dès maintenant réserver un nouveau créneau directement depuis votre espace client.</p>
    ${
      bookLink
        ? `<p style="text-align:center;margin:24px 0;">
             <a href="${bookLink}" style="display:inline-block;background:#C8A060;color:#000;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
               Réserver un nouveau créneau →
             </a>
           </p>`
        : ""
    }
    <p style="color:#666;font-size:14px;margin:16px 0 0;">Si vous avez des questions, n'hésitez pas à contacter Geoffrey directement.</p>
  `;

  return sendBookingEmail({
    type: "booking_cancelled",
    subject,
    html: wrapWithBranding(inner),
    booking
  });
}
