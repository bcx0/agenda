import { prisma } from "./prisma";

export type GoogleSyncHealth = {
  isConnected: boolean;
  googleEmail: string | null;
  needsReauth: boolean;
};

/**
 * Vraie santé de la sync Google Calendar.
 *
 * Le refresh OAuth peut "réussir" alors que l'API Calendar rejette le token
 * (post_refresh_401 — panne du 03/07) : comparer à token.updatedAt ne suffit
 * pas. La référence fiable est la dernière opération de sync réussie vs la
 * dernière auth_error. Utilisé par /admin (bannière) et /admin/settings.
 */
export async function getGoogleSyncHealth(): Promise<GoogleSyncHealth> {
  const [googleToken, recentAuthError, lastSyncOk] = await Promise.all([
    prisma.googleToken.findFirst(),
    prisma.syncLog.findFirst({
      where: { table: "GoogleToken", action: "auth_error" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.syncLog.findFirst({
      where: {
        action: { notIn: ["auth_error", "error"] },
        direction: { in: ["google_to_app", "app_to_google"] }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const needsReauth = Boolean(
    googleToken &&
      recentAuthError &&
      (!lastSyncOk || recentAuthError.createdAt > lastSyncOk.createdAt)
  );

  return {
    isConnected: Boolean(googleToken),
    googleEmail: googleToken?.googleEmail ?? null,
    needsReauth
  };
}
