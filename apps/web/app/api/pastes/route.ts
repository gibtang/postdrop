import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { apiError } from "@/lib/http";
import { createPaste, MAX_CIPHERTEXT_BYTES, MAX_FILE_BYTES } from "@/lib/pastes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory sliding window, per IP. Resets on deploy — enough abuse
// resistance for an unauthenticated free tool at experiment scale.
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 10;
const recentCreates = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recentCreates.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= WINDOW_LIMIT) return true;
  hits.push(now);
  recentCreates.set(ip, hits);
  if (recentCreates.size > 5000) {
    for (const [key, times] of recentCreates) {
      if (times.every((t) => now - t >= WINDOW_MS)) recentCreates.delete(key);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return (clean || "file").slice(0, 200);
}

function decodeBase64(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CIPHERTEXT_BYTES * 2) {
    return null;
  }
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 0 || buf.length > MAX_CIPHERTEXT_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return apiError(429, "RATE_LIMITED", "Too many secrets created. Try again later.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "BAD_JSON");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const kind = b.kind === "file" ? "file" : b.kind === "text" ? "text" : null;
  if (!kind) return apiError(400, "BAD_KIND", "kind must be 'text' or 'file'");

  const ciphertext = decodeBase64(b.ciphertext);
  if (!ciphertext) {
    return apiError(400, "BAD_CIPHERTEXT", `ciphertext must be base64, 1–${MAX_CIPHERTEXT_BYTES} bytes`);
  }

  if (typeof b.iv !== "string" || b.iv.length === 0 || b.iv.length > 64) {
    return apiError(400, "BAD_IV");
  }

  const ttlHours = b.ttlHours;
  if (typeof ttlHours !== "number" || !Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 720) {
    return apiError(400, "BAD_TTL", "ttlHours must be an integer between 1 and 720");
  }

  let filename: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number;
  if (kind === "file") {
    if (typeof b.filename !== "string" || b.filename.trim().length === 0) {
      return apiError(400, "BAD_FILENAME", "filename is required for file secrets");
    }
    filename = sanitizeFilename(b.filename);
    mimeType = typeof b.mimeType === "string" ? b.mimeType.slice(0, 100) : null;
    sizeBytes =
      typeof b.sizeBytes === "number" && Number.isInteger(b.sizeBytes) && b.sizeBytes > 0
        ? Math.min(b.sizeBytes, MAX_FILE_BYTES)
        : ciphertext.length;
  } else {
    sizeBytes = Math.max(0, ciphertext.length - 16); // minus GCM tag
  }

  await connectDb();
  const created = await createPaste({
    kind,
    iv: b.iv,
    ciphertext,
    ttlHours,
    filename,
    mimeType,
    sizeBytes,
  });

  return NextResponse.json({ token: created.token, expiresAt: created.expiresAt.toISOString() });
}
