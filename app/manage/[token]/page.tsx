export const runtime = "nodejs";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { token: string };
};

export default function ManageRedirectPage({ params }: PageProps) {
  redirect(`/rdv/manage/${params.token}`);
}
