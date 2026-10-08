import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/lib/auth/agent-key";
import { apiError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Drop } from "@/lib/models";
import { dropSummary } from "@/lib/drop-summary";
import { newLinkToken, linkUrlFor } from "@/lib/links";
import { getStorage, originalKey } from "@/lib/storage";
import { accountStorageBytes, FREE_TIER_CAP_BYTES, MAX_FILE_BYTES } from "@/lib/quota";
import { sendDropNotification } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createHeadersSchema = z.object({
  filename: z.string().min(1).max(1024),
  recipientEmail: z.string().email(),
  ttlHours: z.coerce.number().int().min(1).max(720).default(168),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

function encodeCursor(createdAt: Date, dropId: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${dropId}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; dropId: string } | null {
  try {
    const [iso, dropId] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(iso);
    if (!dropId || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, dropId };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  await connectDb();
  const agent = await requireAgent(req);
  if (!agent) return apiError(401, "UNAUTHORIZED", "missing or invalid agent key");

  const parsed = createHeadersSchema.safeParse({
    filename: req.headers.get("x-filename") ?? undefined,
    recipientEmail: req.headers.get("x-recipient-email") ?? undefined,
    ttlHours: req.headers.get("x-ttl-hours") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(422, "INVALID_INPUT", "x-filename, x-recipient-email, x-ttl-hours (1-720) required");
  }
  const { filename, recipientEmail, ttlHours } = parsed.data;

  const contentLengthHeader = req.headers.get("content-length");
  const sizeBytes = contentLengthHeader === null ? NaN : Number(contentLengthHeader);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    return apiError(422, "INVALID_INPUT", "content-length header required for raw binary upload");
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    return apiError(413, "FILE_TOO_LARGE", "per-file limit is 1 GB");
  }
  const used = await accountStorageBytes(agent.accountId);
  if (used + sizeBytes > FREE_TIER_CAP_BYTES) {
    return apiError(403, "QUOTA_EXCEEDED", "free tier storage cap of 100 MB reached");
  }
  if (!req.body) {
    return apiError(422, "INVALID_INPUT", "request body is required");
  }

  const { token, linkTokenHash } = newLinkToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const drop = await Drop.create({
    accountId: agent.accountId,
    agentId: agent.agentId,
    recipientEmail,
    filename,
    sizeBytes,
    linkTokenHash,
    expiresAt,
  });
  const storageKey = originalKey(drop.dropId, filename);
  drop.storageKey = storageKey;

  try {
    await getStorage().putStream(storageKey, req.body, { contentLength: sizeBytes });
    await Drop.updateOne({ dropId: drop.dropId }, { storageKey });
  } catch (err) {
    await Drop.deleteOne({ dropId: drop.dropId });
    console.error("v1/drops: storage write failed:", err instanceof Error ? err.message : err);
    return apiError(500, "STORAGE_ERROR", "failed to store upload");
  }

  const linkUrl = linkUrlFor(token);
  // Fire-and-forget recipient notification; email failure must not fail the request.
  void sendDropNotification(drop, linkUrl).then((notifiedAt) => {
    if (notifiedAt) {
      void Drop.updateOne({ dropId: drop.dropId }, { notifiedAt }).exec();
    }
  });

  return NextResponse.json(
    { dropId: drop.dropId, linkUrl, expiresAt: expiresAt.toISOString(), filename, sizeBytes },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  await connectDb();
  const agent = await requireAgent(req);
  if (!agent) return apiError(401, "UNAUTHORIZED", "missing or invalid agent key");

  const parsed = listQuerySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return apiError(422, "INVALID_INPUT", "limit must be 1-100");
  const { limit, cursor } = parsed.data;

  const filter: Record<string, unknown> = { agentId: agent.agentId };
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return apiError(422, "INVALID_INPUT", "malformed cursor");
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, dropId: { $lt: decoded.dropId } },
    ];
  }

  const rows = await Drop.find(filter).sort({ createdAt: -1, dropId: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return NextResponse.json({
    drops: page.map(dropSummary),
    ...(hasMore && last ? { nextCursor: encodeCursor(last.createdAt, last.dropId) } : {}),
  });
}
