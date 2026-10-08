import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { resolveLinkDrop } from "@/lib/link-access";
import { Agent } from "@/lib/models";

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
  const agent = await Agent.findOne({ agentId: drop.agentId });
  return NextResponse.json({
    filename: drop.filename,
    sizeBytes: drop.sizeBytes,
    mimeType: drop.mimeType,
    expiresAt: drop.expiresAt.toISOString(),
    ...(agent ? { agentName: agent.name } : {}),
  });
}
