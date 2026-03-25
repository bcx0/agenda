import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protéger uniquement les routes /admin
  // Exclure /admin pour éviter la boucle infinie
  if (pathname.startsWith("/admin") && pathname !== "/admin") {
    const adminCookie = req.cookies.get("gm_admin_session");

    // Si pas de cookie admin → redirect login
    if (!adminCookie || !adminCookie.value) {
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
