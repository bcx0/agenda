import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getValidAccessToken, type GoogleCalendarEvent } from "../../../../lib/google-calendar";

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
    timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
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

    let imported = 0;
    let skipped = 0;

    for (const event of allEvents) {
      if (!event.start?.dateTime && !event.start?.date) {
        skipped++;
        continue;
      }

      const existing = await prisma.block.findFirst({
        where: { googleEventId: event.id },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const startAt = new Date(event.start.dateTime ?? event.start.date!);
      const endAt = new Date(event.end.dateTime ?? event.end.date!);

      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        skipped++;
        continue;
      }

      await prisma.block.create({
        data: {
          startAt,
          endAt,
          reason: event.summary || "Event Google Calendar",
          googleEventId: event.id,
          googleEtag: event.etag,
          syncSource: "google",
          syncStatus: "synced",
          lastSyncedAt: new Date(),
        },
      });

      imported++;
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: allEvents.length,
    });
  } catch (error: unknown) {
    console.error("[CalendarSync] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur sync",
      },
      { status: 500 }
    );
  }
}
