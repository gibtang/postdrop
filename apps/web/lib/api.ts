import { NextResponse } from "next/server";
import { Artifact, ShareLink, type ArtifactDoc, type ShareLinkDoc } from "./models";
import { mimeForFilename, maxArtifactBytes, quotaBytes, ACTIVE_TYPES, SANDBOX_CSP } from "./formats";

// Re-exported for endpoint modules that need the caps without a second import.
export { maxArtifactBytes, quotaBytes } from "./formats";
import { recordEvent } from "./events";
import { artifactKey, getStorage } from "./storage/index";
import { newId } from "./ids";

/** Uniform error envelope: { error: { code, message? } }. */
export function apiError(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json(
    { error: { code, ...(message ? { message } : {}) } },
    { status },
  );
}

export function apiJson(status: number, data: unknown): NextResponse {
  return NextResponse.json(data, { status });
}

type DateLike = Date | null | undefined;

function iso(value: DateLike): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

export function serializeArtifact(doc: ArtifactDoc): {
  artifactId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    artifactId: doc.artifactId,
    filename: doc.filename,
    contentType: doc.contentType,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeShareLink(doc: ShareLinkDoc): {
  linkId: string;
  url: string;
  expiresAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  createdAt: string;
} {
  return {
    linkId: doc.linkId,
    url: `${baseUrl()}/a/${doc.linkToken}`,
    expiresAt: iso(doc.expiresAt),
    expiredAt: iso(doc.expiredAt),
    revokedAt: iso(doc.revokedAt),
    createdAt: doc.createdAt.toISOString(),
  };
}

export function baseUrl(): string {
  return (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function isShareLinkLive(link: {
  revokedAt?: DateLike;
  expiredAt?: DateLike;
  expiresAt?: DateLike;
}): boolean {
  if (link.revokedAt || link.expiredAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return false;
  return true;
}

export function shareHeaders(contentType: string, filename: string): Headers {
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${filename.replace(/["\\]/g, "")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (ACTIVE_TYPES.includes(contentType)) {
    headers.set("Content-Security-Policy", SANDBOX_CSP);
  }
  return headers;
}

export async function quotaUsedBytes(userId: string): Promise<number> {
  const [agg] = await Artifact.aggregate<{ total: number | null }>([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return agg?.total ?? 0;
}

export interface UploadCheck {
  ok: true;
  contentType: string;
}

export function checkUploadFormat(
  filename: string,
  size: number,
): { ok: false; status: number; code: string; message: string } | { ok: true; contentType: string } {
  const contentType = mimeForFilename(filename);
  if (contentType === null) {
    return {
      ok: false,
      status: 422,
      code: "UNSUPPORTED_FORMAT",
      message:
        `Unsupported file extension for "${filename}". Renderable formats: ` +
        "png, jpg, jpeg, gif, webp, avif, svg, pdf, mp4, webm, mp3, wav, ogg, txt, md, html, json, csv, xml",
    };
  }
  const max = maxArtifactBytes();
  if (!Number.isInteger(size) || size < 0) {
    return { ok: false, status: 400, code: "BAD_REQUEST", message: "Invalid file size" };
  }
  if (size > max) {
    return {
      ok: false,
      status: 413,
      code: "FILE_TOO_LARGE",
      message:
        `File is ${size} bytes; the limit is ${max}. ` +
        "Use POST /v1/uploads/presign for direct-to-storage uploads over 4.5MB.",
    };
  }
  return { ok: true, contentType };
}

export async function checkQuota(
  userId: string,
  incoming: number,
): Promise<{ ok: false; status: number; code: string; message: string } | { ok: true }> {
  const used = await quotaUsedBytes(userId);
  if (used + incoming > quotaBytes()) {
    return {
      ok: false,
      status: 422,
      code: "QUOTA_EXCEEDED",
      message: `Storage quota exceeded: ${used + incoming} bytes needed, quota is ${quotaBytes()}`,
    };
  }
  return { ok: true };
}

/** Core upload path shared by multipart POST, PATCH and the MCP tools. */
export async function createArtifactFromBytes(
  userId: string,
  bytes: Buffer,
  filename: string,
): Promise<{ ok: true; artifact: ArtifactDoc } | { ok: false; res: NextResponse }> {
  const format = checkUploadFormat(filename, bytes.byteLength);
  if (!format.ok) return { ok: false, res: apiError(format.status, format.code, format.message) };
  const quota = await checkQuota(userId, bytes.byteLength);
  if (!quota.ok) return { ok: false, res: apiError(quota.status, quota.code, quota.message) };

  const artifactId = newId("art_");
  const key = artifactKey(artifactId, filename);
  await getStorage().putStream(key, toWebStream(bytes), {
    contentType: format.contentType,
    contentLength: bytes.byteLength,
  });
  const now = new Date();
  const artifact = await Artifact.create({
    artifactId,
    userId,
    filename,
    contentType: format.contentType,
    size: bytes.byteLength,
    storageKey: key,
    createdAt: now,
    updatedAt: now,
  });
  recordEvent({ type: "artifact_uploaded", userId, data: { artifactId, filename, size: bytes.byteLength } });
  return { ok: true, artifact };
}

export function toWebStream(bytes: Buffer): ReadableStream {
  return new Blob([new Uint8Array(bytes)]).stream();
}
