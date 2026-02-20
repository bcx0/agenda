import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

type CalendarToDbPayload = {
  eventId?: string;
  startTime?: string;
  endTime?: string;
  summary?: string;
  status?: string;
};

function isAuthorized(req: NextApiRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers["x-webhook-secret"];
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const provided = (Array.isArray(headerSecret) ? headerSecret[0] : headerSecret) ?? bearer;

  return provided === secret;
}

function mapStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") return "CANCELLED";
  if (normalized === "confirmed") return "CONFIRMED";
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = (req.body ?? {}) as CalendarToDbPayload;
  const eventId = payload.eventId?.toString().trim();
  if (!eventId) {
    return res.status(400).json({ error: "Missing eventId" });
  }

  const bookingId = Number(eventId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "eventId must be a numeric booking id" });
  }

  const data: {
    startAt?: Date;
    endAt?: Date;
    status?: string;
    rescheduleReason?: string;
  } = {};

  if (payload.startTime) data.startAt = new Date(payload.startTime);
  if (payload.endTime) data.endAt = new Date(payload.endTime);

  if (data.startAt && Number.isNaN(data.startAt.getTime())) {
    return res.status(400).json({ error: "Invalid startTime" });
  }
  if (data.endAt && Number.isNaN(data.endAt.getTime())) {
    return res.status(400).json({ error: "Invalid endTime" });
  }

  const mappedStatus = mapStatus(payload.status);
  if (mappedStatus) data.status = mappedStatus;
  if (payload.summary) data.rescheduleReason = payload.summary;

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  try {
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data
    });

    return res.status(200).json({
      ok: true,
      bookingId: updated.id,
      status: updated.status
    });
  } catch {
    return res.status(404).json({ error: "Booking not found" });
  }
}
