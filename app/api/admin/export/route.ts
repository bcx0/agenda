import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = process.env.EXPORT_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "EXPORT_API_TOKEN not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(toParam) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }

  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: { startAt: { gte: from, lte: to } },
      orderBy: { startAt: "asc" },
      include: { client: { select: { id: true, name: true, email: true } } },
    }),
    prisma.block.findMany({
      where: { startAt: { gte: from, lte: to } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    bookings: bookings.map((b) => ({
      id: b.id,
      clientId: b.clientId,
      clientName: b.client.name,
      clientEmail: b.client.email,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: b.status,
      mode: b.mode,
      googleEventId: b.googleEventId,
      syncStatus: b.syncStatus,
      syncSource: b.syncSource,
      lastSyncedAt: b.lastSyncedAt?.toISOString() ?? null,
      bookedBy: b.bookedBy,
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      reason: b.reason,
      googleEventId: b.googleEventId,
      syncStatus: b.syncStatus,
      syncSource: b.syncSource,
      lastSyncedAt: b.lastSyncedAt?.toISOString() ?? null,
    })),
  });
}
