import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import {
  apiError,
  apiJson,
  checkQuota,
  checkUploadFormat,
  createArtifactFromBytes,
  serializeArtifact,
} from "@/lib/api";
import { checkRateLimit, CREATE_RATE_LIMIT_PER_MIN } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");

  const url = new URL(req.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const cursorParam = url.searchParams.get("cursor");
  let cursorFilter: Record<string, unknown> = {};
  if (cursorParam !== null && cursorParam !== "") {
    let parsed: { c?: unknown; i?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf8")) as {
        c?: unknown;
        i?: unknown;
      };
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid cursor");
    }
    if (
      typeof parsed.c !== "string" ||
      typeof parsed.i !== "string" ||
      Number.isNaN(Date.parse(parsed.c))
    ) {
      return apiError(400, "BAD_REQUEST", "Invalid cursor");
    }
    const c = new Date(parsed.c);
    cursorFilter = {
      $or: [{ createdAt: { $lt: c } }, { createdAt: c, artifactId: { $lt: parsed.i } }],
    };
  }

  const docs = await Artifact.find({ userId: token.userId, ...cursorFilter })
    .sort({ createdAt: -1, artifactId: -1 })
    .limit(limit + 1);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({
          c: page[page.length - 1].createdAt.toISOString(),
          i: page[page.length - 1].artifactId,
        }),
      ).toString("base64")
    : null;

  return apiJson(200, {
    items: page.map(serializeArtifact),
    nextCursor,
  });
}

export async function POST(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  if (!checkRateLimit(`upload:${token.keyHash}`, CREATE_RATE_LIMIT_PER_MIN, 60_000)) {
    return apiError(429, "TOO_MANY_REQUESTS", "Upload rate limit exceeded; retry later");
  }

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

  // Fail fast on format/size/quota before reading storage.
  const format = checkUploadFormat(filename, file.size);
  if (!format.ok) return apiError(format.status, format.code, format.message);
  const quota = await checkQuota(token.userId, file.size);
  if (!quota.ok) return apiError(quota.status, quota.code, quota.message);

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await createArtifactFromBytes(token.userId, bytes, filename);
  if (!result.ok) return result.res;
  return apiJson(201, { artifact: serializeArtifact(result.artifact) });
}
