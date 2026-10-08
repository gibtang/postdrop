import type { DropDoc } from "./models";

/** Wire shape shared by /v1 and /api drop listings. */
export function dropSummary(drop: DropDoc) {
  return {
    dropId: drop.dropId,
    status: drop.status,
    recipientEmail: drop.recipientEmail,
    filename: drop.filename,
    sizeBytes: drop.sizeBytes,
    expiresAt: drop.expiresAt.toISOString(),
    createdAt: drop.createdAt.toISOString(),
    hasReply: drop.replyText != null,
    hasEdit: drop.editStorageKey != null,
  };
}
