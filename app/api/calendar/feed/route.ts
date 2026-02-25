import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const expectedToken = process.env.ADMIN_CALENDAR_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: now }
    },
    include: { client: true },
    orderBy: { startAt: "asc" }
  });

  const dtStamp = toIcsDate(now);

  const events = bookings
    .map((booking) => {
      const uid = `booking-${booking.id}@agenda-geoffreymahieu`;
      const summary = escapeIcs(`Rendez-vous Geoffrey Mahieu - ${booking.client.name}`);
      const description = escapeIcs(
        [
          `Client: ${booking.client.name}`,
          `Email: ${booking.client.email}`,
          `Mode: ${booking.mode}`
        ].join("\n")
      );

      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${toIcsDate(booking.startAt)}`,
        `DTEND:${toIcsDate(booking.endAt)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Rappel rendez-vous",
        "TRIGGER:-PT1H",
        "END:VALARM",
        "END:VEVENT"
      ].join("\r\n");
    })
    .join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Geoffrey Mahieu//Agenda Feed//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Agenda Geoffrey Mahieu",
    "X-WR-TIMEZONE:Europe/Brussels",
    events,
    "END:VCALENDAR"
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda-geoffrey.ics"',
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
    }
  });
}
