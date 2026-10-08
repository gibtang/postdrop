import type { DropDoc } from "./models";
import { Drop } from "./models";
import { purgeDrop } from "./purge";
import { sha256Hex } from "./crypto";

export type LinkResolution =
  | { ok: true; drop: DropDoc }
  | { ok: false; status: 404 }
  | { ok: false; status: 410 };

/**
 * Shared Link access: hash token -> Drop; 404 when unknown; 410 (with
 * purge-on-access) when expired, revoked, or already purged.
 */
export async function resolveLinkDrop(token: string): Promise<LinkResolution> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, status: 404 };
  const drop = await Drop.findOne({ linkTokenHash: sha256Hex(token) });
  if (!drop) return { ok: false, status: 404 };
  if (drop.status === "expired" || drop.purgedAt || drop.expiresAt.getTime() < Date.now()) {
    await purgeDrop(drop);
    return { ok: false, status: 410 };
  }
  return { ok: true, drop };
}
