import { randomBytes } from "node:crypto";
import { Paste } from "./models";
import { sha256Hex } from "./crypto";

/** 64 hex chars of entropy; only its sha256 is stored. */
function newLinkToken(): { token: string; linkTokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, linkTokenHash: sha256Hex(token) };
}

/** Hard cap on stored ciphertext (bytes). ~6 MB covers 5 MB plaintext + GCM tag. */
export const MAX_CIPHERTEXT_BYTES = 6_000_000;

/** Client-side cap for file secrets; text secrets only hit the ciphertext cap. */
export const MAX_FILE_BYTES = 5_000_000;

export const PASTE_TTL_HOURS = [1, 24, 72, 168] as const;

export type CreatedPaste = {
  token: string;
  expiresAt: Date;
};

export async function createPaste(input: {
  kind: "text" | "file";
  iv: string;
  ciphertext: Buffer;
  ttlHours: number;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
}): Promise<CreatedPaste> {
  const { token, linkTokenHash } = newLinkToken();
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);
  await Paste.create({
    tokenHash: linkTokenHash,
    kind: input.kind,
    filename: input.filename ?? null,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes,
    iv: input.iv,
    ciphertext: input.ciphertext,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * One-time fetch: atomically nulls the ciphertext and returns the pre-update
 * doc. Exactly one caller ever receives content; every later call lands on the
 * tombstone branch. Expired-but-unswept docs are not served.
 */
export type BurnedFetch =
  | {
      outcome: "content";
      paste: {
        kind: "text" | "file";
        filename: string | null;
        mimeType: string | null;
        sizeBytes: number;
        iv: string;
        ciphertextB64: string;
        expiresAt: string | null;
      };
    }
  | { outcome: "viewed" }
  | { outcome: "expired" }
  | { outcome: "missing" };

/**
 * One-time fetch: atomically nulls the ciphertext and returns the pre-update
 * doc. Exactly one caller ever receives content; every later call lands on a
 * tombstone outcome. Expired-but-unswept docs are not served.
 */
export async function fetchAndBurnPaste(tokenHash: string): Promise<BurnedFetch> {
  const now = new Date();
  const doc = await Paste.findOneAndUpdate(
    { tokenHash, ciphertext: { $ne: null }, expiresAt: { $gt: now } },
    { $set: { ciphertext: null, burnedAt: now } },
    { new: false },
  );
  if (doc) {
    return {
      outcome: "content",
      paste: {
        kind: doc.kind,
        filename: doc.filename ?? null,
        mimeType: doc.mimeType ?? null,
        sizeBytes: doc.sizeBytes,
        iv: doc.iv,
        ciphertextB64: doc.ciphertext ? Buffer.from(doc.ciphertext).toString("base64") : "",
        expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : null,
      },
    };
  }
  const tombstone = await Paste.findOne(
    { tokenHash },
    { expiresAt: 1, burnedAt: 1 },
  ).lean();
  if (!tombstone) return { outcome: "missing" };
  return tombstone.expiresAt instanceof Date && tombstone.expiresAt < now
    ? { outcome: "expired" }
    : { outcome: "viewed" };
}

/** Sweeper body: drop ciphertext from every expired paste. */
export async function purgeExpiredPastes(now = new Date()): Promise<number> {
  const result = await Paste.updateMany(
    { ciphertext: { $ne: null }, expiresAt: { $lt: now } },
    { $set: { ciphertext: null, purgedAt: now } },
  );
  return result.modifiedCount ?? 0;
}
