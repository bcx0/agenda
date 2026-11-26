import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getAdminSession } from "../../../../lib/session";
import { getConnectedGoogleAccount } from "../../../../lib/google-calendar";
import { isReauthError } from "../../../../lib/google-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jamais servi depuis le cache de Next (voir lib/google-calendar.ts).
export const fetchCache = "force-no-store";

export type GoogleAccountStatus = {
  connected: boolean;
  /** Compte renvoyé par Google à l'instant (null si Google n'a pas répondu). */
  liveEmail: string | null;
  /** Compte enregistré lors de la dernière connexion dans les réglages. */
  storedEmail: string | null;
  needsReauth: boolean;
  error: string | null;
  checkedAt: string;
};

/**
 * Compte Google réellement branché à l'agenda, interrogé EN DIRECT (case
 * « Compte Google connecté » de l'admin). Réservé à l'admin connecté.
 */
export async function GET() {
  if (!getAdminSession()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = await prisma.googleToken.findFirst({ select: { googleEmail: true } });
  const base: GoogleAccountStatus = {
    connected: Boolean(token),
    liveEmail: null,
    storedEmail: token?.googleEmail ?? null,
    needsReauth: false,
    error: null,
    checkedAt: new Date().toISOString()
  };
  if (!token) {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const account = await getConnectedGoogleAccount();
    return NextResponse.json(
      { ...base, liveEmail: account.email },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ...base,
        needsReauth: isReauthError(err),
        error: isReauthError(err)
          ? "Google refuse la connexion : reconnectez Google Calendar dans les réglages."
          : "Google n'a pas répondu. Nouvelle tentative automatique."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
