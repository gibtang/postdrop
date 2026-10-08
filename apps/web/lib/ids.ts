import { randomBytes } from "node:crypto";
import { sha256Hex } from "./crypto";

/** 32 lowercase hex chars (128 bits of entropy). */
export function c32hex(): string {
  return randomBytes(16).toString("hex");
}

export type IdPrefix = "acct_" | "agnt_" | "drop_";

export function newId(prefix: IdPrefix): string {
  return prefix + c32hex();
}

/** Generates a full agent key + its stored hash/prefix pair. */
export function newAgentKey(): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const secret = randomBytes(32).toString("hex");
  const key = `pd_live_${secret}`;
  return {
    key,
    keyHash: sha256Hex(key),
    keyPrefix: `pd_live_${secret.slice(0, 6)}`,
  };
}
