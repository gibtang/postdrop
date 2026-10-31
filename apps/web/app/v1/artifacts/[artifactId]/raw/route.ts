import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, shareHeaders } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";

export async function GET(req: NextRequest, { params }: { params: Promise<{ artifactId: string }> }) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { artifactId } = await params;
  const artifact = await Artifact.findOne({ artifactId, userId: token.userId });
  if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found");

  const stream = await getStorage().getStream(artifact.storageKey);
  return new Response(stream, { headers: shareHeaders(artifact.contentType, artifact.filename) });
}
