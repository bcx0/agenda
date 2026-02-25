"use server";

import { redirect } from "next/navigation";
import { authenticateClient } from "../../lib/auth";
import { clearClientSession, setClientSession } from "../../lib/session";
import type { LoginState } from "./types";

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    return { error: "Merci de renseigner email et mot de passe." };
  }

  const result = await authenticateClient(email, password);
  if (!result.ok || !result.client) {
    return { error: result.message };
  }

  setClientSession({
    type: "client",
    clientId: result.client.id,
    email: result.client.email,
    name: result.client.name
  });

  redirect("/manage");
}

export async function logoutAction() {
  clearClientSession();
  redirect("/");
}
