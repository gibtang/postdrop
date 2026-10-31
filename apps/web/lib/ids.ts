import { randomBytes } from "node:crypto";
import { sha256Hex } from "./crypto";

/** 32 lowercase hex chars (128 bits of entropy). */
export function c32hex(): string {
  return randomBytes(16).toString("hex");
}

export type IdPrefix = "art_" | "tok_" | "slnk_" | "paste_" | "evt_";

export function newId(prefix: IdPrefix): string {
  return prefix + c32hex();
}

/** Generates a full bearer token + its stored hash/prefix pair. */
export function newToken(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = randomBytes(32).toString("hex");
  const token = `pd_live_${secret}`;
  return {
    token,
    tokenHash: sha256Hex(token),
    tokenPrefix: `pd_live_${secret.slice(0, 6)}`,
  };
}
