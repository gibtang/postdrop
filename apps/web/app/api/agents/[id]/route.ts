import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";
import { Agent } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const { id } = await params;
  const agent = await Agent.findOne({ agentId: id, accountId: owner.accountId });
  if (!agent) return apiError(404, "NOT_FOUND");
  if (!agent.revokedAt) {
    agent.revokedAt = new Date();
    await agent.save();
  }
  return NextResponse.json({ agentId: agent.agentId, revokedAt: agent.revokedAt.toISOString() });
}
