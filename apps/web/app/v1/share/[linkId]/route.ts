import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError } from "@/lib/api";
import { recordEvent } from "@/lib/events";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { linkId } = await params;
  const link = await ShareLink.findOne({ linkId, userId: token.userId });
  if (!link) return apiError(404, "NOT_FOUND", "Share link not found");
  if (link.revokedAt === null) {
    link.revokedAt = new Date();
    await link.save();
    recordEvent({ type: "share_revoked", userId: token.userId, data: { linkId } });
  }
  return new Response(null, { status: 204 });
}
