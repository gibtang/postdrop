import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson, checkQuota, checkUploadFormat, serializeArtifact, serializeShareLink, toWebStream } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";
import { recordEvent } from "@/lib/events";

type Params = { params: Promise<{ artifactId: string }> };

async function loadOwnArtifact(userId: string, artifactId: string) {
  return Artifact.findOne({ artifactId, userId });
}

export async function GET(req: NextRequest, { params }: Params) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { artifactId } = await params;
  const artifact = await loadOwnArtifact(token.userId, artifactId);
  if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found");
  const links = await ShareLink.find({ artifactId }).sort({ createdAt: -1 });
  return apiJson(200, {
    artifact: serializeArtifact(artifact),
    shareLinks: links.map(serializeShareLink),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { artifactId } = await params;
  const artifact = await loadOwnArtifact(token.userId, artifactId);
  if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "BAD_REQUEST", "Expected multipart/form-data with a file field");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "BAD_REQUEST", "Missing file field");
  }
  const nameField = form.get("name");
  const filename = typeof nameField === "string" && nameField !== "" ? nameField : file.name;

  const format = checkUploadFormat(filename, file.size);
  if (!format.ok) return apiError(format.status, format.code, format.message);
  const quota = await checkQuota(token.userId, file.size - artifact.size);
  if (!quota.ok) return apiError(quota.status, quota.code, quota.message);

  const bytes = Buffer.from(await file.arrayBuffer());
  await getStorage().putStream(artifact.storageKey, toWebStream(bytes), {
    contentType: format.contentType,
    contentLength: bytes.byteLength,
  });
  artifact.filename = filename;
  artifact.contentType = format.contentType;
  artifact.size = bytes.byteLength;
  artifact.updatedAt = new Date();
  await artifact.save();
  recordEvent({
    type: "artifact_edited",
    userId: token.userId,
    data: { artifactId, filename, size: bytes.byteLength },
  });
  return apiJson(200, { artifact: serializeArtifact(artifact) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const { artifactId } = await params;
  const artifact = await loadOwnArtifact(token.userId, artifactId);
  if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found");

  await getStorage().remove(artifact.storageKey);
  await ShareLink.deleteMany({ artifactId });
  await artifact.deleteOne();
  recordEvent({ type: "artifact_deleted", userId: token.userId, data: { artifactId } });
  return new Response(null, { status: 204 });
}
