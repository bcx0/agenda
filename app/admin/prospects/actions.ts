"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "../../../lib/session";
import {
  createProspect,
  deleteProspect,
  isProspectStatus,
  updateProspectStatus,
} from "../../../lib/prospects";

const BRUSSELS_TZ = "Europe/Brussels";

function assertAdmin() {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");
}

function backTo(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return `/admin/prospects${search ? `?${search}` : ""}`;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court"),
  email: z.string().trim().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  desiredAt: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function createProspectAction(formData: FormData) {
  assertAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    desiredAt: formData.get("desiredAt") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Données invalides";
    redirect(backTo({ error: message }));
  }

  const { name, email, phone, desiredAt, note } = parsed.data;

  let desired: Date | null = null;
  if (desiredAt) {
    // datetime-local (sans fuseau) interprété en heure de Bruxelles, comme le
    // reste de l'app, pour rester cohérent avec Google Calendar.
    const dt = DateTime.fromISO(desiredAt, { zone: BRUSSELS_TZ });
    if (dt.isValid) desired = dt.toJSDate();
  }

  await createProspect({
    name,
    email: email ? email : null,
    phone: phone ? phone : null,
    desiredAt: desired,
    note: note ? note : null,
  });

  revalidatePath("/admin/prospects");
  redirect(backTo({ success: "Prospect ajouté" }));
}

export async function updateProspectStatusAction(formData: FormData) {
  assertAdmin();
  const id = Number(formData.get("id"));
  const status = formData.get("status")?.toString() ?? "";

  if (!Number.isFinite(id) || !isProspectStatus(status)) {
    redirect(backTo({ error: "Requête invalide" }));
  }
  if (!isProspectStatus(status)) return; // narrow for TS

  await updateProspectStatus(id, status);
  revalidatePath("/admin/prospects");
  redirect(backTo({ success: "Statut mis à jour" }));
}

export async function deleteProspectAction(formData: FormData) {
  assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) {
    redirect(backTo({ error: "Requête invalide" }));
  }
  await deleteProspect(id);
  revalidatePath("/admin/prospects");
  redirect(backTo({ success: "Prospect supprimé" }));
}
