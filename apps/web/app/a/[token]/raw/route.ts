import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { apiError, isShareLinkLive, shareHeaders } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await connectDb();
  const { token: linkToken } = await params;
  const link = await ShareLink.findOne({ linkToken });
  if (!link || !isShareLinkLive(link)) {
    return apiError(404, "NOT_FOUND", "This link does not exist or is no longer available");
  }
  const artifact = await Artifact.findOne({ artifactId: link.artifactId });
  if (!artifact) {
    return apiError(404, "NOT_FOUND", "This link does not exist or is no longer available");
  }
  const stream = await getStorage().getStream(artifact.storageKey);
  return new Response(stream, { headers: shareHeaders(artifact.contentType, artifact.filename) });
}
