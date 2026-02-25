import type { NextApiRequest, NextApiResponse } from "next";

type DbToCalendarPayload = {
  bookingId?: number | string;
  date?: string;
  clientName?: string;
  service?: string;
  timezone?: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = (req.body ?? {}) as DbToCalendarPayload;
  if (!payload.bookingId || !payload.date || !payload.clientName || !payload.timezone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!makeWebhookUrl) {
    return res.status(500).json({ error: "MAKE_WEBHOOK_URL is not configured" });
  }

  const response = await fetch(makeWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": process.env.WEBHOOK_SECRET as string
    },
    body: JSON.stringify({
      bookingId: payload.bookingId,
      date: payload.date,
      clientName: payload.clientName,
      service: payload.service ?? "Rendez-vous",
      timezone: payload.timezone
    })
  });

  if (!response.ok) {
    return res.status(502).json({ error: "Failed to forward to Make.com" });
  }

  return res.status(200).json({ ok: true });
}
