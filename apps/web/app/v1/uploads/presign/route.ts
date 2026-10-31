import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson, checkQuota, checkUploadFormat } from "@/lib/api";
import { artifactKey, getStorage } from "@/lib/storage/index";
import { newId } from "@/lib/ids";
import { isRenderable } from "@/lib/formats";

interface PresignBody {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
}

export async function POST(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");

  let body: PresignBody;
  try {
    body = (await req.json()) as PresignBody;
  } catch {
    return apiError(400, "BAD_REQUEST", "Request body must be JSON");
  }
  const { filename, contentType, size } = body;
  if (typeof filename !== "string" || filename === "") {
    return apiError(400, "BAD_REQUEST", "filename is required");
  }
  if (typeof contentType !== "string" || !isRenderable(contentType)) {
    return apiError(422, "UNSUPPORTED_FORMAT", `contentType "${String(contentType)}" is not renderable`);
  }
  if (typeof size !== "number") {
    return apiError(400, "BAD_REQUEST", "size must be a number");
  }
  const format = checkUploadFormat(filename, size);
  if (!format.ok) return apiError(format.status, format.code, format.message);
  const quota = await checkQuota(token.userId, size);
  if (!quota.ok) return apiError(quota.status, quota.code, quota.message);

  const artifactId = newId("art_");
  const key = artifactKey(artifactId, filename);
  let uploadUrl: string;
  try {
    uploadUrl = (await getStorage().presignPut(key, contentType)).url;
  } catch (err: unknown) {
    console.error(
      "presign: storage driver rejected presignPut:",
      err instanceof Error ? err.message : err,
    );
    return apiError(
      501,
      "PRESIGN_UNAVAILABLE",
      "Direct upload is not available on this storage driver",
    );
  }
  return apiJson(201, { uploadUrl, key, contentType });
}
