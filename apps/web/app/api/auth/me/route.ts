import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  return NextResponse.json({
    accountId: owner.accountId,
    email: owner.email,
    tier: owner.tier,
  });
}
