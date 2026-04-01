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

/**
 * Check admin password.
 * Supports both bcrypt-hashed passwords (starting with $2) and plain-text
 * for backward compatibility. Recommend setting ADMIN_PASSWORD as a bcrypt hash.
 */
export function checkAdminPassword(input: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    // Fail secure — deny access if password not configured
    return false;
  }

  // If the env var looks like a bcrypt hash, use bcrypt.compareSync
  if (adminPassword.startsWith("$2")) {
    return bcrypt.compareSync(input, adminPassword);
  }

  // Fallback: timing-safe plain-text comparison (prevents timing attacks)
  if (input.length !== adminPassword.length) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;

  // Use crypto.timingSafeEqual for constant-time comparison
  const crypto = require("crypto");
  return crypto.timingSafeEqual(a, b);
}
