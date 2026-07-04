import crypto from "crypto";

import { cookies } from "next/headers";

const CLIENT_COOKIE = "gm_client_session";
const ADMIN_COOKIE = "gm_admin_session";

type ClientPayload = {
  type: "client";
  clientId: number;
  email: string;
  name: string;
  /** Signed expiry (ms epoch) — enforced server-side, not only via cookie maxAge. */
  exp?: number;
};

type AdminPayload = {
  type: "admin";
  /** Signed expiry (ms epoch) — enforced server-side, not only via cookie maxAge. */
  exp?: number;
};

type Payload = ClientPayload | AdminPayload;

const getSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET manquant");
  }
  return secret;
};

const sign = (value: string) => {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(value);
  return hmac.digest("base64url");
};

const encode = (payload: Payload) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(data);
  return `${data}.${signature}`;
};

const decode = (value: string): Payload | null => {
  const [data, signature] = value.split(".");
  if (!data || !signature) return null;
  // Constant-time comparison (like the middleware) to avoid timing attacks
  const expected = Buffer.from(sign(data));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

export function getClientSession(): ClientPayload | null {
  const value = cookies().get(CLIENT_COOKIE)?.value;
  if (!value) return null;
  const payload = decode(value);
  if (payload && payload.type === "client") return payload;
  return null;
}

export function setClientSession(payload: ClientPayload) {
  const value = encode({ ...payload, exp: Date.now() + 60 * 60 * 24 * 30 * 1000 });
  cookies().set(CLIENT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearClientSession() {
  cookies().set(CLIENT_COOKIE, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
  });
}

export function getAdminSession(): AdminPayload | null {
  const value = cookies().get(ADMIN_COOKIE)?.value;
  if (!value) return null;
  const payload = decode(value);
  if (payload && payload.type === "admin") return payload;
  return null;
}

export function setAdminSession() {
  const value = encode({ type: "admin", exp: Date.now() + 60 * 60 * 4 * 1000 });
  cookies().set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4
  });
}

export function clearAdminSession() {
    cookies().set(ADMIN_COOKIE, "", {
          path: "/",
          maxAge: 0,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production"
    });
}
