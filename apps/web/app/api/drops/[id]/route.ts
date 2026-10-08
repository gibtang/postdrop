import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";
import { Drop } from "@/lib/models";
import { purgeDrop } from "@/lib/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const { id } = await params;
  const drop = await Drop.findOne({ dropId: id, accountId: owner.accountId });
  if (!drop) return apiError(404, "NOT_FOUND");
  if (drop.status !== "expired" || !drop.purgedAt) {
    await purgeDrop(drop);
  }
  return NextResponse.json({ dropId: drop.dropId, status: "expired" });
}
