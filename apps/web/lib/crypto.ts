import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const SESSION_COOKIE = "pd_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_TTL = SESSION_TTL_SECONDS;

export interface SessionPayload {
  accountId: string;
  exp: number; // unix seconds
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Signed session token: base64url(payload) + "." + base64url(HMAC). */
export function signSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

/** Verifies signature + expiry; returns payload or null. */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = hmac(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.accountId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 < Date.now()
  ) {
    return null;
  }
  return payload;
}
