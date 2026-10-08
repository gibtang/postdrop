import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { requireOwner } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";
import { Agent } from "@/lib/models";
import { newAgentKey } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const agents = await Agent.find({ accountId: owner.accountId }).sort({ createdAt: -1 });
  return NextResponse.json({
    agents: agents.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      keyPrefix: a.keyPrefix,
      revokedAt: a.revokedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  await connectDb();
  const owner = await requireOwner();
  if (!owner) return apiError(401, "UNAUTHORIZED");
  const parsed = z.object({ name: z.string().min(1).max(100) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(422, "INVALID_INPUT", "name (1-100 chars) required");

  const { key, keyHash, keyPrefix } = newAgentKey();
  const agent = await Agent.create({
    accountId: owner.accountId,
    name: parsed.data.name,
    keyHash,
    keyPrefix,
  });
  // Plaintext key is returned exactly once and never stored.
  return NextResponse.json(
    {
      agentId: agent.agentId,
      name: agent.name,
      keyPrefix: agent.keyPrefix,
      key,
      createdAt: agent.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
