import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verify admin session cookie signature without importing lib/session
 * (Edge Runtime cannot use Node.js-only modules from lib/).
 */
function verifyAdminCookie(cookieValue: string): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  const [data, signature] = cookieValue.split(".");
  if (!data || !signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const expected = hmac.digest("base64url");

  // Timing-safe comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  // Verify payload is actually an admin session
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return payload?.type === "admin";
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin/* routes (except /admin login page itself)
  if (pathname.startsWith("/admin") && pathname !== "/admin") {
    const adminCookie = req.cookies.get("gm_admin_session");

    // Validate cookie existence AND cryptographic signature
    if (!adminCookie || !adminCookie.value || !verifyAdminCookie(adminCookie.value)) {
      const loginUrl = new URL("/admin", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
