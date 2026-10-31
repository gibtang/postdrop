import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-user";
import { apiError } from "@/lib/http";
import { sweeperTick } from "@/lib/sweeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs one full sweeper pass (share-link expiry, paste purge). */
export async function POST(req: NextRequest) {
  await connectDb();
  const user = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const result = await sweeperTick();
  return NextResponse.json(result);
}
