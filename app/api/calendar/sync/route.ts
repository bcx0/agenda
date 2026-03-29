import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getValidAccessToken, type GoogleCalendarEvent } from "../../../../lib/google-calendar";
import { pullFromGoogle } from "../../../../lib/sync-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
};

/**
 * Paginated sync: each POST processes ONE page of Google Calendar events.
 * The client calls this endpoint repeatedly until `nextPageToken` is null.
 *
 * Query params:
 *   ?pageToken=xxx  — Google Calendar page token (omit for first call)
 *   ?reset=true     — Reset syncToken on first call
 */
export async function POST(req: NextRequest) {
  try {
    const token = await prisma.googleToken.findFirst();

    if (!token) {
      return NextResponse.json(
        { error: "Google Calendar non connecté" },
        { status: 401 }
      );
    }

    const accessToken = await getValidAccessToken();

    const url = new URL(req.url);
    const incomingPageToken = url.searchParams.get("pageToken") || undefined;
    const shouldReset = url.searchParams.get("reset") === "true";

    // Reset syncToken on first page only
    if (shouldReset && !incomingPageToken) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: { syncToken: null },
      });
    }

    // Fetch ONE page of events from Google Calendar
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (incomingPageToken) {
      params.set("pageToken", incomingPageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Calendar list failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as GoogleEventsListResponse;
    const events = data.items ?? [];
    const nextPageToken = data.nextPageToken ?? null;

    console.log(
      `[ManualSync] Page: ${events.length} events, hasMore: ${!!nextPageToken}`
    );

    // Process events sequentially (safe for serverless, avoids connection pool issues)
    const results: Array<{ eventId: string; action: string }> = [];

    for (const event of events) {
      try {
        const result = await pullFromGoogle(
          event.status === "cancelled" ? null : event,
          event.id
        );
        results.push({ eventId: event.id, action: result.action });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ManualSync] Error processing event ${event.id}:`, message);
        results.push({ eventId: event.id, action: `error: ${message}` });
      }
    }

    const imported = results.filter(
      (r) => r.action === "booking_created" || r.action === "block_created"
    ).length;
    const updated = results.filter(
      (r) => r.action === "booking_updated" || r.action === "booking_cancelled"
    ).length;
    const errors = results.filter((r) => r.action.startsWith("error")).length;

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors,
      pageCount: events.length,
      nextPageToken,
      done: !nextPageToken,
    });
  } catch (error: unknown) {
    console.error("[ManualSync] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur sync",
      },
      { status: 500 }
    );
  }
}
