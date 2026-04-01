import { NextRequest, NextResponse } from "next/server";

/**
 * Verify admin session cookie HMAC signature using Web Crypto API.
 * Edge Runtime does NOT have Node.js crypto — must use subtle crypto.
 */
async function verifyAdminCookie(cookieValue: string): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  const [data, signature] = cookieValue.split(".");
  if (!data || !signature) return false;

  try {
    const encoder = new TextEncoder();

    // Import the secret as an HMAC key
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the data part
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));

    // Encode as base64url (matching Node.js hmac.digest("base64url"))
    const expected = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(sig))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    if (diff !== 0) return false;

    // Verify payload is actually an admin session
    const raw = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(raw);
    return payload?.type === "admin";
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin/* routes (except /admin login page itself)
  if (pathname.startsWith("/admin") && pathname !== "/admin") {
    const adminCookie = req.cookies.get("gm_admin_session");

    // Validate cookie existence AND cryptographic signature
    if (
      !adminCookie ||
      !adminCookie.value ||
      !(await verifyAdminCookie(adminCookie.value))
    ) {
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
