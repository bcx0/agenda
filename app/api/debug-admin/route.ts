import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, string> = {};

  // Test 1: cookies import
  try {
    const { cookies } = await import("next/headers");
    const c = cookies();
    results["cookies"] = "OK — " + (c.getAll().length) + " cookies";
  } catch (e: any) {
    results["cookies"] = "FAIL — " + e.message;
  }

  // Test 2: session
  try {
    const { getAdminSession } = await import("../../../lib/session");
    const session = getAdminSession();
    results["session"] = "OK — session=" + JSON.stringify(session);
  } catch (e: any) {
    results["session"] = "FAIL — " + e.message;
  }

  // Test 3: env vars
  results["SESSION_SECRET"] = process.env.SESSION_SECRET ? "SET" : "MISSING";
  results["ADMIN_PASSWORD"] = process.env.ADMIN_PASSWORD ? "SET" : "MISSING";
  results["DATABASE_URL"] = process.env.DATABASE_URL ? "SET (len=" + process.env.DATABASE_URL.length + ")" : "MISSING";
  results["DIRECT_URL"] = process.env.DIRECT_URL ? "SET" : "MISSING";
  results["SUPABASE_ANON_KEY"] = process.env.SUPABASE_ANON_KEY ? "SET" : "MISSING";

  // Test 4: Prisma import
  try {
    const { prisma } = await import("../../../lib/prisma");
    results["prisma_import"] = "OK";
  } catch (e: any) {
    results["prisma_import"] = "FAIL — " + e.message;
  }

  // Test 5: Prisma query
  try {
    const { prisma } = await import("../../../lib/prisma");
    const count = await prisma.client.count();
    results["prisma_query"] = "OK — " + count + " clients";
  } catch (e: any) {
    results["prisma_query"] = "FAIL — " + e.message;
  }

  // Test 6: admin page imports
  try {
    const admin = await import("../../../lib/admin");
    results["admin_import"] = "OK";
  } catch (e: any) {
    results["admin_import"] = "FAIL — " + e.message;
  }

  return NextResponse.json(results, { status: 200 });
}
