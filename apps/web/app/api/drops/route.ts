import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";
import { Drop } from "@/lib/models";
import { dropSummary } from "@/lib/drop-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

export async function GET(req: NextRequest) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const drops = await Drop.find({ accountId: owner.accountId })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT);
  return NextResponse.json({ drops: drops.map(dropSummary) });
}
