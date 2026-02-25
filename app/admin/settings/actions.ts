"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { updateSettings } from "../../../lib/settings";
import { getAdminSession } from "../../../lib/session";

function assertAdmin() {
  const session = getAdminSession();
  if (!session) redirect("/admin?error=unauthorized");
}

export async function saveSettingsAction(formData: FormData) {
  assertAdmin();
  const schema = z.object({
    location: z.enum(["MIAMI", "BELGIUM"]),
    presentielLocation: z.string().min(2),
    presentielNote: z.string().optional(),
    defaultMode: z.enum(["VISIO", "PRESENTIEL"])
  });

  const parsed = schema.safeParse({
    location: formData.get("location"),
    presentielLocation: formData.get("presentielLocation"),
    presentielNote: formData.get("presentielNote") ?? undefined,
    defaultMode: formData.get("defaultMode")
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=Champs%20invalides");
  }

  await updateSettings({
    ...parsed.data,
    presentielNote: parsed.data.presentielNote || null
  });
  revalidatePath("/admin/settings");
}
