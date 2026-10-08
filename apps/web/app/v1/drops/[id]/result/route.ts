import { NextRequest, NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth/agent-key";
import { apiError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Drop } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDb();
  const agent = await requireAgent(req);
  if (!agent) return apiError(401, "UNAUTHORIZED", "missing or invalid agent key");
  const { id } = await params;
  const drop = await Drop.findOne({ dropId: id, agentId: agent.agentId });
  if (!drop) return apiError(404, "NOT_FOUND");
  return NextResponse.json({
    dropId: drop.dropId,
    status: drop.status,
    ...(drop.replyText != null ? { replyText: drop.replyText } : {}),
    ...(drop.editFilename != null
      ? { edit: { filename: drop.editFilename, sizeBytes: drop.editSizeBytes ?? 0 } }
      : {}),
  });
}
