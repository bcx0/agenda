import { NextResponse } from "next/server";
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

async function listGoogleEvents(
  accessToken: string,
  pageToken?: string
): Promise<GoogleEventsListResponse> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Calendar list failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as GoogleEventsListResponse;
}

export async function POST() {
  try {
    const token = await prisma.googleToken.findFirst();

    if (!token) {
      return NextResponse.json(
        { error: "Google Calendar non connecté" },
        { status: 401 }
      );
    }

    const accessToken = await getValidAccessToken();

    let allEvents: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
      const response = await listGoogleEvents(accessToken, pageToken);
      allEvents = allEvents.concat(response.items ?? []);
      pageToken = response.nextPageToken;
    } while (pageToken);

    const results: Array<{ eventId: string; action: string }> = [];

    for (const event of allEvents) {
      try {
        const result = await pullFromGoogle(
          event.status === "cancelled" ? null : event,
          event.id
        );
        results.push({ eventId: event.id, action: result.action });
      } catch (err: any) {
        console.error(`[ManualSync] Error processing event ${event.id}:`, err);
        results.push({ eventId: event.id, action: `error: ${err.message}` });
      }
    }

    const imported = results.filter(
      (r) => r.action === "booking_created" || r.action === "block_created"
    ).length;
    const updated = results.filter(
      (r) => r.action === "booking_updated" || r.action === "booking_cancelled"
    ).length;
    const skipped = results.filter(
      (r) =>
        r.action === "etag_updated" ||
        r.action === "not_found" ||
        r.action === "skipped_all_day" ||
        r.action === "conflict_app_wins"
    ).length;

    console.log(
      `[ManualSync] Processed ${allEvents.length} events: ${imported} imported, ${updated} updated, ${skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: allEvents.length,
      results,
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
