import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { resolveLinkDrop } from "@/lib/link-access";
import { getStorage } from "@/lib/storage";
import { attachmentHeaders } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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
  if (!drop.storageKey) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const stream = await getStorage().getStream(drop.storageKey);
  return new NextResponse(stream, {
    headers: attachmentHeaders(drop.filename, drop.mimeType, drop.sizeBytes),
  });
}
