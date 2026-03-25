import { NextResponse } from "next/server";
import { getAdminSession } from "../../../../lib/session";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const parsed = logs.map((log: { id: number; to: string; subject: string; body: string; createdAt: Date }) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(log.body);
    } catch {
      /* ignore */
    }
    return {
      id: log.id,
      to: log.to,
      subject: log.subject,
      createdAt: log.createdAt,
      status: (meta as Record<string, unknown>).status ?? "unknown",
      error: (meta as Record<string, unknown>).error ?? null,
      type: (meta as Record<string, unknown>).type ?? null
    };
  });

  return NextResponse.json(parsed);
}
