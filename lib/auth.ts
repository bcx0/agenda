import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getClientSession } from "./session";

export async function authenticateClient(email: string, password: string) {
  const client = await prisma.client.findUnique({ where: { email } });
  if (!client || !client.isActive) {
    return { ok: false, message: "Accès réservé aux clients sous contrat." };
  }
  const valid = await bcrypt.compare(password, client.passwordHash);
  if (!valid) {
    return { ok: false, message: "Email ou mot de passe incorrect." };
  }
  return { ok: true, client };
}

export async function getCurrentClient() {
  const session = getClientSession();
  if (!session) return null;
  const client = await prisma.client.findUnique({
    where: { id: session.clientId }
  });
  if (!client || !client.isActive) return null;
  return client;
}

export function checkAdminPassword(input: string) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD non défini");
  }
  return input === adminPassword;
}
