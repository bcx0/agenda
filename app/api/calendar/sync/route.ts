import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getValidAccessToken, type GoogleCalendarEvent } from "../../../../lib/google-calendar";
import { pullFromGoogle } from "../../../../lib/sync-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Step-based sync to stay within Vercel Hobby timeout (10s).
 *
 * Step 1: ?step=fetch&pageToken=...
 *   → Fetches ONE page of events from Google (fast, ~1-2s)
 *   → Returns list of event IDs + data + nextPageToken
 *
 * Step 2: ?step=process
 *   → Body: { events: GoogleCalendarEvent[] }
 *   → Processes a batch of events (sent by client, typically 50)
 *   → Returns results
 */
export async function POST(req: NextRequest) {
  try {
    const token = await prisma.googleToken.findFirst();
    if (!token) {
      return NextResponse.json({ error: "Google Calendar non connecté" }, { status: 401 });
    }

    const url = new URL(req.url);
    const step = url.searchParams.get("step") || "fetch";

    if (step === "fetch") {
      const accessToken = await getValidAccessToken();
      const pageToken = url.searchParams.get("pageToken") || undefined;
      const shouldReset = url.searchParams.get("reset") === "true";

      if (shouldReset && !pageToken) {
        await prisma.googleToken.update({
          where: { id: token.id },
          data: { syncToken: null },
        });
      }

      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (pageToken) params.set("pageToken", pageToken);

      // Retry up to 3 times on rate limit (429/403)
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }
        );
        if (response.status !== 403 && response.status !== 429) break;
        // Wait before retry: 2s, 4s, 8s
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
      }

      if (!response || !response.ok) {
        const errorText = await (response?.text() ?? Promise.resolve("no response"));
        throw new Error(`Google Calendar: ${response?.status} ${errorText}`);
      }

      const data = await response.json();
      const events = (data.items ?? []) as GoogleCalendarEvent[];
      const nextPageToken = data.nextPageToken ?? null;

      console.log(`[Sync:fetch] Got ${events.length} events, hasMore: ${!!nextPageToken}`);

      return NextResponse.json({
        step: "fetch",
        events,
        nextPageToken,
      });
    }

    if (step === "process") {
      const body = await req.json();
      const events = (body.events ?? []) as GoogleCalendarEvent[];

      // Bulk pre-check: 2 queries to find ALL already-imported events
      const eventIds = events.map((e) => e.id);
      const [existingBookings, existingBlocks] = await Promise.all([
        prisma.booking.findMany({
          where: { googleEventId: { in: eventIds } },
          select: { googleEventId: true },
        }),
        prisma.block.findMany({
          where: { googleEventId: { in: eventIds } },
          select: { googleEventId: true },
        }),
      ]);
      const alreadyImported = new Set([
        ...existingBookings.map((b) => b.googleEventId),
        ...existingBlocks.map((b) => b.googleEventId),
      ]);

      const results: Array<{ eventId: string; action: string }> = [];

      for (const event of events) {
        // Skip already-imported events instantly (no DB query needed)
        if (alreadyImported.has(event.id) && event.status !== "cancelled") {
          results.push({ eventId: event.id, action: "already_exists" });
          continue;
        }

        try {
          const result = await pullFromGoogle(
            event.status === "cancelled" ? null : event,
            event.id
          );
          results.push({ eventId: event.id, action: result.action });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[Sync:process] Error ${event.id}:`, message);
          results.push({ eventId: event.id, action: `error: ${message}` });
        }
      }

      const imported = results.filter(
        (r) => r.action === "booking_created" || r.action === "block_created"
      ).length;

      return NextResponse.json({
        step: "process",
        processed: results.length,
        imported,
        results,
      });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur sync" },
      { status: 500 }
    );
  }
}
