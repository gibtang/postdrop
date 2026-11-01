import { NextResponse } from "next/server";
import { Artifact, ShareLink, type ArtifactDoc, type ShareLinkDoc } from "./models";
import { contentMatchesFormat, mimeForFilename, maxArtifactBytes, quotaBytes, ACTIVE_TYPES, SANDBOX_CSP } from "./formats";

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
        `File is ${size} bytes; the per-artifact limit is ${max}. Split the content into smaller artifacts.`
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
  opts?: { storedFilename?: string },
): Promise<{ ok: true; artifact: ArtifactDoc } | { ok: false; res: NextResponse }> {
  // `filename` is the wire name: extension contract + content sniffing key off
  // it. `storedFilename` (optional) is a display label that must never affect
  // validation.
  const format = checkUploadFormat(filename, bytes.byteLength);
  if (!format.ok) return { ok: false, res: apiError(format.status, format.code, format.message) };
  const contentMatch = contentMatchesFormat(bytes, format.contentType);
  if (contentMatch === false) {
    const ext = filename.slice(filename.lastIndexOf(".") + 1) || "file";
    return {
      ok: false,
      res: apiError(
        422,
        "UNSUPPORTED_FORMAT",
        `File content does not look like a valid ${ext} file (format detected from its bytes).`,
      ),
    };
  }
  const quota = await checkQuota(userId, bytes.byteLength);
  if (!quota.ok) return { ok: false, res: apiError(quota.status, quota.code, quota.message) };

  const stored = opts?.storedFilename?.trim() || filename;
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
    filename: stored,
    contentType: format.contentType,
    size: bytes.byteLength,
    storageKey: key,
    createdAt: now,
    updatedAt: now,
  });
  recordEvent({ type: "artifact_uploaded", userId, data: { artifactId, filename: stored, size: bytes.byteLength } });
  return { ok: true, artifact };
}

export function toWebStream(bytes: Buffer): ReadableStream {
  return new Blob([new Uint8Array(bytes)]).stream();
}

/** First bytes of a stored object, up to `max` — for magic-byte checks. */
export async function readStoredHead(key: string, max: number): Promise<Buffer> {
  const stream = await getStorage().getStream(key);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
