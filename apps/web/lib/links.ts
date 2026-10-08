import { randomBytes } from "node:crypto";
import { sha256Hex } from "./crypto";

const TOKEN_BYTES = 32; // 64 hex chars

export function newLinkToken(): { token: string; linkTokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return { token, linkTokenHash: sha256Hex(token) };
}

export function linkUrlFor(token: string): string {
  const base = (process.env.BASE_URL || "").replace(/\/+$/, "");
  return `${base}/l/${token}`;
}
