import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { pullFromGoogle } from "../../../../lib/sync-engine";
import {
  fetchChangedEvents,
  type GoogleCalendarEvent,
} from "../../../../lib/google-calendar";

// Sans maxDuration, une notification qui déclenche une full sync (syncToken
// null ou expiré 410) meurt au timeout par défaut AVANT de sauver le
// syncToken → chaque notification suivante repart en full sync. Une fois le
// syncToken en place, les notifications ne traitent que les deltas (<1s).
export const maxDuration = 300;

// Traite les événements par lots de 5 en parallèle (même logique que le cron).
async function processEvents(
  events: GoogleCalendarEvent[],
  results: Array<{ eventId: string; action: string }>
): Promise<void> {
  const CONCURRENCY = 5;
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const chunk = events.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (event) => {
        try {
          const result = await pullFromGoogle(
            event.status === "cancelled" ? null : event,
            event.id
          );
          results.push({ eventId: event.id, action: result.action });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[Webhook] Error processing event ${event.id}:`, message);
          results.push({ eventId: event.id, action: `error: ${message}` });
        }
      })
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const channelToken = req.headers.get("x-goog-channel-token");
    const resourceState = req.headers.get("x-goog-resource-state");

    const expectedToken = process.env.GOOGLE_WEBHOOK_SECRET;
    if (!channelToken || channelToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initial sync notification from Google — do a full sync to catch up
    // This fires when a watch is first registered and ensures we capture
    // events that existed before the watch was created
    if (resourceState === "sync") {
      const token = await prisma.googleToken.findFirst();
      if (token) {
        try {
          const { items, nextSyncToken } = await fetchChangedEvents(token.syncToken);

          const results: Array<{ eventId: string; action: string }> = [];
          await processEvents(items, results);

          // Persist the syncToken only AFTER processing: if the function dies
          // mid-loop (timeout), the old token stays and the next notification
          // re-fetches the missed events (pullFromGoogle is idempotent).
          if (nextSyncToken) {
            await prisma.googleToken.update({
              where: { id: token.id },
              data: { syncToken: nextSyncToken },
            });
          }
          console.log(`[Webhook:sync] Processed ${items.length} events:`, JSON.stringify(results));
        } catch (err: unknown) {
          console.error("[Webhook:sync] Error during initial sync:", err);
        }
      }
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

    // Process each changed event (lots de 5 en parallèle)
    const results: Array<{ eventId: string; action: string }> = [];
    await processEvents(events, results);

    // Persist the syncToken only AFTER processing (see comment above): a crash
    // mid-loop keeps the old token so missed events are re-fetched next time.
    if (finalSyncToken) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: { syncToken: finalSyncToken },
      });
    }

    console.log(
      `[Webhook] Processed ${events.length} events:`,
      JSON.stringify(results)
    );

    return NextResponse.json({ ok: true, processed: events.length, results });
  } catch (error: unknown) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur webhook" },
      { status: 500 }
    );
  }
}
