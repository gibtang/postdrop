import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson, serializeShareLink } from "@/lib/api";
import { c32hex } from "@/lib/ids";
import { recordEvent } from "@/lib/events";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { artifactId } = await params;
  const artifact = await Artifact.findOne({ artifactId, userId: token.userId });
  if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found");

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text === "" ? {} : JSON.parse(text) as unknown;
  } catch {
    return apiError(400, "BAD_REQUEST", "Request body must be JSON");
  }
  let expiresAt: Date | null = null;
  if (
    typeof body === "object" &&
    body !== null &&
    "expiresAt" in body &&
    body.expiresAt !== undefined &&
    body.expiresAt !== null
  ) {
    const { expiresAt: raw } = body as { expiresAt: unknown };
    if (typeof raw !== "string") {
      return apiError(400, "BAD_REQUEST", "expiresAt must be an ISO timestamp string");
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return apiError(400, "BAD_REQUEST", "expiresAt must be an ISO timestamp string");
    }
    if (parsed.getTime() <= Date.now()) {
      return apiError(400, "BAD_REQUEST", "expiresAt must be in the future");
    }
    expiresAt = parsed;
  }

  const link = await ShareLink.create({
    linkToken: c32hex(),
    artifactId,
    userId: token.userId,
    expiresAt,
  });
  recordEvent({ type: "share_created", userId: token.userId, data: { linkId: link.linkId, artifactId } });
  return apiJson(201, { shareLink: serializeShareLink(link) });
}
