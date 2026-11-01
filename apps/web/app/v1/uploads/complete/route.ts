import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson, checkQuota, readStoredHead, serializeArtifact } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";
import { contentMatchesFormat, mimeForFilename, maxArtifactBytes } from "@/lib/formats";
import { recordEvent } from "@/lib/events";

const KEY_PATTERN = /^artifacts\/(art_[0-9a-f]{32})\/([A-Za-z0-9._-]{1,200})$/;

interface CompleteBody {
  key?: unknown;
  filename?: unknown;
}

export async function POST(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");

  let body: CompleteBody;
  try {
    body = (await req.json()) as CompleteBody;
  } catch {
    return apiError(400, "BAD_REQUEST", "Request body must be JSON");
  }
  const { key, filename } = body;
  if (typeof key !== "string" || typeof filename !== "string" || filename === "") {
    return apiError(400, "BAD_REQUEST", "key and filename are required");
  }
  const match = KEY_PATTERN.exec(key);
  if (!match) return apiError(400, "BAD_REQUEST", "Invalid upload key");
  const contentType = mimeForFilename(filename);
  if (contentType === null) {
    return apiError(
      422,
      "UNSUPPORTED_FORMAT",
      `Unsupported file extension for "${filename}". Use a renderable format.`,
    );
  }

  const head = await getStorage().head(key);
  if (!head) return apiError(400, "KEY_NOT_UPLOADED", "No object exists at this key yet");
  const max = maxArtifactBytes();
  if (head.size > max) {
    return apiError(413, "FILE_TOO_LARGE", `Uploaded object is ${head.size} bytes; the limit is ${max}`);
  }
  const quota = await checkQuota(token.userId, head.size);
  if (!quota.ok) return apiError(quota.status, quota.code, quota.message);
  const contentMatch = contentMatchesFormat(await readStoredHead(key, 64), contentType);
  if (contentMatch === false) {
    return apiError(
      422,
      "UNSUPPORTED_FORMAT",
      `Uploaded content does not look like a valid ${filename.slice(filename.lastIndexOf(".") + 1) || "file"} file.`,
    );
  }

  const artifactId = match[1];
  const now = new Date();
  const artifact = await Artifact.create({
    artifactId,
    userId: token.userId,
    filename,
    contentType,
    size: head.size,
    storageKey: key,
    createdAt: now,
    updatedAt: now,
  });
  recordEvent({
    type: "artifact_uploaded",
    userId: token.userId,
    data: { artifactId, filename, size: head.size, via: "presign" },
  });
  return apiJson(201, { artifact: serializeArtifact(artifact) });
}
