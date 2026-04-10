export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { clientUsageThisMonth } from "../../../lib/admin";
import { prisma } from "../../../lib/prisma";
import { getAdminSession } from "../../../lib/session";
import ClientsList from "./ClientsList";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  success?: string;
  name?: string;
  email?: string;
  creditsPerMonth?: string;
};

export default async function AdminClientsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");

  const [clients, usageMap] = await Promise.all([
    prisma.client.findMany({ orderBy: { createdAt: "desc" } }),
    clientUsageThisMonth()
  ]);

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error[0]
    : searchParams?.error;
  const rawSuccess = Array.isArray(searchParams?.success)
    ? searchParams?.success[0]
    : searchParams?.success;
  const rawName = Array.isArray(searchParams?.name) ? searchParams?.name[0] : searchParams?.name;
  const rawEmail = Array.isArray(searchParams?.email) ? searchParams?.email[0] : searchParams?.email;
  const rawCredits = Array.isArray(searchParams?.creditsPerMonth)
    ? searchParams?.creditsPerMonth[0]
    : searchParams?.creditsPerMonth;

  return (
    <ClientsList
      initialClients={clients.map((client: any) => ({
        id: client.id,
        name: client.name,
        email: client.email,
        isActive: client.isActive,
        creditsPerMonth: client.creditsPerMonth,
        usedThisMonth: usageMap.get(client.id) ?? 0
      }))}
      errorMessage={rawError ? decodeURIComponent(rawError) : undefined}
      successMessage={rawSuccess ? decodeURIComponent(rawSuccess) : undefined}
      addFormDefaults={{
        name: rawName ?? "",
        email: rawEmail ?? "",
        creditsPerMonth: rawCredits ?? ""
      }}
    />
  );
}
