import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { pullFromGoogle } from "../../../../lib/sync-engine";
import { fetchChangedEvents } from "../../../../lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const channelToken = req.headers.get("x-goog-channel-token");
    const resourceState = req.headers.get("x-goog-resource-state");

    const expectedToken = process.env.GOOGLE_WEBHOOK_SECRET;
    if (!channelToken || channelToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initial sync verification from Google — just acknowledge
    if (resourceState === "sync") {
      return NextResponse.json({ ok: true });
    }

    const token = await prisma.googleToken.findFirst();
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    // Fetch changed events from Google using incremental syncToken
    const { items, nextSyncToken, fullSyncRequired } = await fetchChangedEvents(
      token.syncToken
    );

    // If syncToken expired (410 Gone), retry without it (full sync of last 30 days)
    let events = items;
    let finalSyncToken = nextSyncToken;

    if (fullSyncRequired) {
      const fullSync = await fetchChangedEvents(null);
      events = fullSync.items;
      finalSyncToken = fullSync.nextSyncToken;
    }

    // Store the new syncToken for next incremental sync
    if (finalSyncToken) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: { syncToken: finalSyncToken },
      });
    }

    // Process each changed event
    const results: Array<{ eventId: string; action: string }> = [];

    for (const event of events) {
      try {
        const result = await pullFromGoogle(
          event.status === "cancelled" ? null : event,
          event.id
        );
        results.push({ eventId: event.id, action: result.action });
      } catch (err: any) {
        console.error(`[Webhook] Error processing event ${event.id}:`, err);
        results.push({ eventId: event.id, action: `error: ${err.message}` });
      }
    }

    console.log(
      `[Webhook] Processed ${events.length} events:`,
      JSON.stringify(results)
    );

    return NextResponse.json({ ok: true, processed: events.length, results });
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur webhook" },
      { status: 500 }
    );
  }
}
