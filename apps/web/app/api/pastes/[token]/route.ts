import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { apiError } from "@/lib/http";
import { fetchAndBurnPaste } from "@/lib/pastes";
import { sha256Hex } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    return apiError(404, "NOT_FOUND");
  }

  await connectDb();
  const result = await fetchAndBurnPaste(sha256Hex(token));

  if (result.outcome === "missing") return apiError(404, "NOT_FOUND");
  if (result.outcome !== "content") {
    return NextResponse.json({ gone: true, reason: result.outcome }, { status: 410 });
  }

  return NextResponse.json({
    kind: result.paste.kind,
    filename: result.paste.filename,
    mimeType: result.paste.mimeType,
    sizeBytes: result.paste.sizeBytes,
    iv: result.paste.iv,
    ciphertext: result.paste.ciphertextB64,
    expiresAt: result.paste.expiresAt,
  });
}
