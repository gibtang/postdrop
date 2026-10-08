import { Drop, type DropDoc } from "./models";
import { getStorage } from "./storage";

/**
 * Shared purge: nulls content fields, sets status/purgedAt (tombstone persists),
 * and removes stored objects. Used by revoke, owner delete, 410 access, sweeper.
 */
export async function purgeDrop(drop: DropDoc): Promise<void> {
  const storage = getStorage();
  const keys = [drop.storageKey, drop.editStorageKey].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    await storage.remove(key).catch((err) => {
      console.error(`purge: failed to remove storage object ${key}:`, err instanceof Error ? err.message : err);
    });
  }
  drop.set({
    storageKey: null,
    replyText: null,
    editStorageKey: null,
    editFilename: null,
    editSizeBytes: null,
    editMimeType: null,
    status: "expired",
    purgedAt: new Date(),
  });
  await drop.save();
}

/** Purge every drop past expiry (sweeper body). */
export async function purgeExpiredDrops(now = new Date()): Promise<number> {
  const expired = await Drop.find({
    status: { $ne: "expired" },
    expiresAt: { $lt: now },
  });
  for (const drop of expired) {
    await purgeDrop(drop);
  }
  return expired.length;
}
