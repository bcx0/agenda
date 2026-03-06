import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { pullFromGoogle } from "../../../../lib/sync-engine";

export async function POST(req: NextRequest) {
  try {
    const channelToken = req.headers.get("x-goog-channel-token");
    const resourceState = req.headers.get("x-goog-resource-state");
    const resourceId = req.headers.get("x-goog-resource-id");

    const expectedToken = process.env.GOOGLE_WEBHOOK_SECRET;
    if (!channelToken || channelToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (resourceState === "sync") {
      return NextResponse.json({ ok: true });
    }

    const token = await prisma.googleToken.findFirst();
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    if (!resourceId) {
      return NextResponse.json({ error: "No resource id" }, { status: 400 });
    }

    await pullFromGoogle(null, resourceId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur webhook" },
      { status: 500 }
    );
  }
}
