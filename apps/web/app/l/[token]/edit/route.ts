import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { resolveLinkDrop } from "@/lib/link-access";
import { editKey, getStorage } from "@/lib/storage";
import { MAX_FILE_BYTES } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editHeadersSchema = z.object({
  filename: z.string().min(1).max(1024),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await connectDb();
  const { token } = await params;
  const resolved = await resolveLinkDrop(token);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: { code: resolved.status === 410 ? "EXPIRED" : "NOT_FOUND" } },
      { status: resolved.status },
    );
  }
  const { drop } = resolved;
  const parsed = editHeadersSchema.safeParse({
    filename: req.headers.get("x-filename") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "x-filename header required" } },
      { status: 422 },
    );
  }
  const contentLengthHeader = req.headers.get("content-length");
  const sizeBytes = contentLengthHeader === null ? NaN : Number(contentLengthHeader);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "content-length header required for raw binary upload" } },
      { status: 422 },
    );
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ error: { code: "FILE_TOO_LARGE" } }, { status: 413 });
  }
  if (!req.body) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "request body is required" } },
      { status: 422 },
    );
  }

  const filename = parsed.data.filename;
  const storageKey = editKey(drop.dropId, filename);
  try {
    await getStorage().putStream(storageKey, req.body, { contentLength: sizeBytes });
  } catch (err) {
    console.error("l/edit: storage write failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { code: "STORAGE_ERROR" } }, { status: 500 });
  }

  // A new Edit replaces any prior one: remove the old object.
  const previousKey = drop.editStorageKey;
  if (previousKey && previousKey !== storageKey) {
    void getStorage()
      .remove(previousKey)
      .catch((err) => {
        console.error("l/edit: failed to remove previous edit:", err instanceof Error ? err.message : err);
      });
  }
  drop.editStorageKey = storageKey;
  drop.editFilename = filename;
  drop.editSizeBytes = sizeBytes;
  drop.editMimeType = req.headers.get("content-type") ?? "application/octet-stream";
  drop.status = "answered";
  drop.answeredAt = new Date();
  await drop.save();
  return NextResponse.json({ status: "answered" });
}
