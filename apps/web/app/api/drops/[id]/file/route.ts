import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError, attachmentHeaders } from "@/lib/http";
import { Drop } from "@/lib/models";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const { id } = await params;
  // Scope-checked by accountId: foreign drops look identical to missing ones (404).
  const drop = await Drop.findOne({ dropId: id, accountId: owner.accountId });
  if (!drop) return apiError(404, "NOT_FOUND");
  if (drop.status === "expired") return apiError(410, "EXPIRED");
  if (!drop.storageKey) return apiError(404, "NOT_FOUND");
  const stream = await getStorage().getStream(drop.storageKey);
  return new NextResponse(stream, {
    headers: attachmentHeaders(drop.filename, drop.mimeType, drop.sizeBytes),
  });
}
