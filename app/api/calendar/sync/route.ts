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

    if (step === "debug") {
      const [bookingCount, blockCount, clientCount, importClientCount, sampleBookings, sampleBlocks] = await Promise.all([
        prisma.booking.count(),
        prisma.block.count(),
        prisma.client.count(),
        prisma.client.count({ where: { email: { endsWith: "@import.local" } } }),
        prisma.booking.findMany({
          take: 5,
          orderBy: { startAt: "asc" },
          where: { startAt: { gte: new Date() } },
          include: { client: { select: { name: true, email: true } } },
        }),
        prisma.block.findMany({
          take: 5,
          orderBy: { startAt: "asc" },
          where: { startAt: { gte: new Date() } },
        }),
      ]);
      return NextResponse.json({
        bookingCount,
        blockCount,
        clientCount,
        importClientCount,
        sampleBookings: sampleBookings.map((b: { id: number; client: { name: string }; startAt: Date; status: string; syncSource: string; googleEventId: string | null }) => ({
          id: b.id,
          client: b.client.name,
          startAt: b.startAt,
          status: b.status,
          syncSource: b.syncSource,
          googleEventId: b.googleEventId ? "yes" : "no",
        })),
        sampleBlocks: sampleBlocks.map((b: { id: number; reason: string | null; startAt: Date; syncSource: string; googleEventId: string | null }) => ({
          id: b.id,
          reason: b.reason,
          startAt: b.startAt,
          syncSource: b.syncSource,
          googleEventId: b.googleEventId ? "yes" : "no",
        })),
      });
    }

    if (step === "purge") {
      // 1. Delete Google-imported bookings + blocks
      const [deletedBookings, deletedBlocks] = await Promise.all([
        prisma.booking.deleteMany({ where: { syncSource: "google" } }),
        prisma.block.deleteMany({ where: { syncSource: "google" } }),
      ]);
      // 2. Find import-only clients
      const importClients = await prisma.client.findMany({
        where: { email: { endsWith: "@import.local" } },
        select: { id: true },
      });
      const importClientIds = importClients.map((c: { id: number }) => c.id);
      // 3. Delete remaining bookings + recurringBlocks tied to import clients
      if (importClientIds.length > 0) {
        await prisma.booking.deleteMany({ where: { clientId: { in: importClientIds } } });
        await prisma.recurringBlock.deleteMany({ where: { clientId: { in: importClientIds } } });
      }
      // 4. Now safe to delete import clients
      const deletedClients = await prisma.client.deleteMany({
        where: { id: { in: importClientIds } },
      });
      console.log(`[Sync:purge] Deleted ${deletedBookings.count} bookings, ${deletedBlocks.count} blocks, ${deletedClients.count} import clients`);
      return NextResponse.json({
        step: "purge",
        deletedBookings: deletedBookings.count,
        deletedBlocks: deletedBlocks.count,
        deletedClients: deletedClients.count,
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
        ...existingBookings.map((b: { googleEventId: string | null }) => b.googleEventId),
        ...existingBlocks.map((b: { googleEventId: string | null }) => b.googleEventId),
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
