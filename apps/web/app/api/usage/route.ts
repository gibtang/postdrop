import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";
import { accountStorageBytes, FREE_TIER_CAP_BYTES } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const storageBytes = await accountStorageBytes(owner.accountId);
  return NextResponse.json({
    tier: owner.tier,
    storageBytes,
    capBytes: FREE_TIER_CAP_BYTES,
  });
}
