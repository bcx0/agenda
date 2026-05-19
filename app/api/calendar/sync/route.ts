import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getValidAccessToken, type GoogleCalendarEvent } from "../../../../lib/google-calendar";
import { pullFromGoogle, bulkImportFromGoogle } from "../../../../lib/sync-engine";

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

    if (step === "test-parse") {
      // Test parser + count action types from last sync
      const { parseGoogleEventSummary } = await import("../../../../lib/parse-google-event");
      const body = await req.json().catch(() => ({}));
      const testSummaries = body.summaries ?? ["RDV — Guillaume Caron", "RDV - Jean Dupont", "Rdv perso", "Meeting", "RDV—Test"];
      const parseResults = testSummaries.map((s: string) => ({
        input: s,
        ...parseGoogleEventSummary(s),
      }));
      return NextResponse.json({ parseResults });
    }

    if (step === "debug") {
      const [bookingCount, blockCount, clientCount] = await Promise.all([
        prisma.booking.count(),
        prisma.block.count(),
        prisma.client.count(),
      ]);
      // Show blocks with their reasons to see what's being classified as block
      const recentBlocks = await prisma.block.findMany({
        take: 15,
        orderBy: { startAt: "asc" },
        where: { startAt: { gte: new Date() } },
      });
      const recentBookings = await prisma.booking.findMany({
        take: 10,
        orderBy: { startAt: "asc" },
        where: { startAt: { gte: new Date() }, status: "CONFIRMED" },
        include: { client: { select: { name: true } } },
      });
      return NextResponse.json({
        bookingCount,
        blockCount,
        clientCount,
        blocks: recentBlocks.map((b: { id: number; reason: string | null; startAt: Date; syncSource: string }) => ({
          id: b.id,
          reason: b.reason,
          startAt: b.startAt,
          syncSource: b.syncSource,
        })),
        bookings: recentBookings.map((b: { id: number; client: { name: string }; startAt: Date; syncSource: string }) => ({
          id: b.id,
          client: b.client.name,
          startAt: b.startAt,
          syncSource: b.syncSource,
        })),
      });
    }

    if (step === "purge") {
      // NUCLEAR PURGE: delete ALL synced data + ALL confirmed bookings
      // Google Calendar is source of truth — everything will be re-imported
      const [deletedGoogleBookings, deletedGoogleBlocks] = await Promise.all([
        prisma.booking.deleteMany({ where: { googleEventId: { not: null } } }),
        prisma.block.deleteMany({ where: { googleEventId: { not: null } } }),
      ]);

      // Also delete ALL remaining confirmed bookings (app-created orphans
      // that survived because their Google push failed or never happened)
      const deletedOrphanBookings = await prisma.booking.deleteMany({
        where: {
          status: 'CONFIRMED',
          syncSource: { not: 'app' },
        },
      });

      // Clean up import-only clients
      const importClients = await prisma.client.findMany({
        where: { email: { endsWith: "@import.local" } },
        select: { id: true },
      });
      const importClientIds = importClients.map((c: { id: number }) => c.id);
      if (importClientIds.length > 0) {
        await prisma.booking.deleteMany({ where: { clientId: { in: importClientIds } } });
        await prisma.recurringBlock.deleteMany({ where: { clientId: { in: importClientIds } } });
        await prisma.client.deleteMany({ where: { id: { in: importClientIds } } });
      }
      // Reset syncToken to force full re-fetch
      await prisma.googleToken.updateMany({ data: { syncToken: null } });

      const remainingBookings = await prisma.booking.count();
      const totalDeleted = deletedGoogleBookings.count + deletedOrphanBookings.count;
      console.log(`[Sync:purge] Deleted ${totalDeleted} bookings (${deletedGoogleBookings.count} google + ${deletedOrphanBookings.count} orphans), ${deletedGoogleBlocks.count} blocks. Remaining: ${remainingBookings}`);
      return NextResponse.json({
        step: "purge",
        deletedBookings: totalDeleted,
        deletedOrphanBookings: deletedOrphanBookings.count,
        deletedBlocks: deletedGoogleBlocks.count,
        remainingBookings,
      });
    }

    // ─── BULK PROCESS: fast path for full resync (after purge) ─────
    // Processes ALL events at once with batch DB operations.
    // ~5 DB queries total instead of ~4 per event.
    if (step === "bulk-process") {
      const body = await req.json();
      const events = (body.events ?? []) as GoogleCalendarEvent[];

      const result = await bulkImportFromGoogle(events);

      return NextResponse.json({
        step: "bulk-process",
        processed: events.length,
        imported: result.bookingsCreated + result.blocksCreated,
        bookingsCreated: result.bookingsCreated,
        blocksCreated: result.blocksCreated,
        noAccountBlocks: result.noAccountBlocks,
        skippedAllDay: result.skippedAllDay,
        skippedCancelled: result.skippedCancelled,
      });
    }

    // ─── INCREMENTAL PROCESS: for normal sync (not after purge) ──
    // Bulk pre-fetch existing records with their etag. Skip only events whose
    // etag matches stored value (perf optim). Events with different/null etag
    // are passed to pullFromGoogle which handles both create and update paths
    // (including time changes on already-imported events).
    if (step === "process") {
      const body = await req.json();
      const events = (body.events ?? []) as GoogleCalendarEvent[];

      const eventIds = events.map((e) => e.id);
      const [existingBookings, existingBlocks] = await Promise.all([
        prisma.booking.findMany({
          where: { googleEventId: { in: eventIds } },
          select: { googleEventId: true, googleEtag: true },
        }),
        prisma.block.findMany({
          where: { googleEventId: { in: eventIds } },
          select: { googleEventId: true, googleEtag: true },
        }),
      ]);
      const etagMap = new Map<string, string | null>();
      for (const b of existingBookings) {
        if (b.googleEventId) etagMap.set(b.googleEventId, b.googleEtag);
      }
      for (const b of existingBlocks) {
        if (b.googleEventId) etagMap.set(b.googleEventId, b.googleEtag);
      }

      const results: Array<{ eventId: string; action: string }> = [];

      for (const event of events) {
        // Skip if event is already in DB with matching etag (no change since
        // last sync). Etag-null records always re-process so we backfill etag.
        if (event.status !== "cancelled" && etagMap.has(event.id)) {
          const storedEtag = etagMap.get(event.id);
          if (storedEtag && storedEtag === event.etag) {
            results.push({ eventId: event.id, action: "etag_unchanged" });
            continue;
          }
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
        (r) => r.action === "booking_created" ||
               r.action === "block_created" ||
               r.action === "block_created_no_account"
      ).length;

      const actionCounts: Record<string, number> = {};
      for (const r of results) {
        const key = r.action.startsWith("error") ? "error" : r.action;
        actionCounts[key] = (actionCounts[key] ?? 0) + 1;
      }

      return NextResponse.json({
        step: "process",
        processed: results.length,
        imported,
        actionCounts,
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
