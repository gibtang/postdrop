import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import {
  apiError,
  apiJson,
  createArtifactFromBytes,
  maxArtifactBytes,
  serializeArtifact,
  serializeShareLink,
} from "@/lib/api";
import { getStorage } from "@/lib/storage/index";
import { c32hex } from "@/lib/ids";
import { recordEvent } from "@/lib/events";

function errorResult(status: number, code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message } }) }],
    _status: status,
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

interface SerializedArtifact {
  artifactId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

type ArtifactPage =
  | { error: { code: string; message: string } }
  | { items: SerializedArtifact[]; nextCursor: string | null };

async function listArtifactsInternal(
  userId: string,
  cursor: string | null,
  limit: number,
): Promise<ArtifactPage> {
  const cursorFilter: Record<string, unknown> = {};
  if (cursor) {
    let parsed: { c?: unknown; i?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as {
        c?: unknown;
        i?: unknown;
      };
    } catch {
      return { error: { code: "BAD_REQUEST", message: "Invalid cursor" } };
    }
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") {
      return { error: { code: "BAD_REQUEST", message: "Invalid cursor" } };
    }
    const c = new Date(parsed.c);
    cursorFilter.$or = [{ createdAt: { $lt: c } }, { createdAt: c, artifactId: { $lt: parsed.i } }];
  }
  const docs = await Artifact.find({ userId, ...cursorFilter })
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
  return { items: page.map(serializeArtifact), nextCursor };
}

function fetchArtifactBytes(
  url: string,
): Promise<{ ok: true; bytes: Buffer; filename: string } | { ok: false; status: number; code: string; message: string }> {
  return (async () => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { ok: false, status: 400, code: "BAD_REQUEST", message: "Only https URLs are supported" };
    }
    const max = maxArtifactBytes();
    const controller = new AbortController();
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    } catch {
      return { ok: false, status: 502, code: "FETCH_FAILED", message: "Could not fetch the URL" };
    }
    if (!res.ok) {
      controller.abort();
      return { ok: false, status: 502, code: "FETCH_FAILED", message: `URL responded with status ${res.status}` };
    }
    const declared = Number.parseInt(res.headers.get("content-length") ?? "", 10);
    if (Number.isInteger(declared) && declared > max) {
      controller.abort();
      return { ok: false, status: 413, code: "FILE_TOO_LARGE", message: `URL body is ${declared} bytes; the limit is ${max}` };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { ok: false, status: 502, code: "FETCH_FAILED", message: "URL response has no body" };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        controller.abort();
        return { ok: false, status: 413, code: "FILE_TOO_LARGE", message: `URL body exceeds ${max} bytes` };
      }
      chunks.push(value);
    }
    const filename = parsed.pathname.split("/").pop() ?? "";
    return { ok: true, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))), filename };
  })();
}

/** One stateless server per request; tools close over the request's userId. */
function buildServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "postdrop", version: "1.0.0" },
    { instructions: "Postdrop artifact API: upload, list, share and delete renderable artifacts." },
  );

  server.tool(
    "upload_artifact",
    "Upload renderable file content as a new Postdrop artifact",
    {
      filename: z.string().min(1),
      content_base64: z.string().min(1),
      name: z.string().optional(),
    },
    async ({ filename, content_base64, name }) => {
      const bytes = Buffer.from(content_base64, "base64");
      // REST contract: `name` replaces the stored filename when provided;
      // format derives from that merged name (CLI pre-appends an extension).
      const merged = typeof name === "string" && name.trim() !== "" ? name.trim() : filename;
      const result = await createArtifactFromBytes(userId, bytes, merged);
      if (!result.ok) {
        const detail = (await result.res.json().catch(() => null)) as {
          error?: { code?: unknown; message?: unknown };
        } | null;
        return errorResult(
          result.res.status,
          typeof detail?.error?.code === "string" ? detail.error.code : "UPLOAD_FAILED",
          typeof detail?.error?.message === "string" ? detail.error.message : "Upload failed",
        );
      }
      return jsonResult({ artifact: serializeArtifact(result.artifact) });
    },
  );

  server.tool(
    "upload_artifact_from_url",
    "Fetch an https URL and store it as a new Postdrop artifact",
    { url: z.string().url(), name: z.string().optional() },
    async ({ url, name }) => {
      const fetched = await fetchArtifactBytes(url);
      if (!fetched.ok) return errorResult(fetched.status, fetched.code, fetched.message);
      // REST contract: `name` replaces the fetched filename when provided.
      const merged = typeof name === "string" && name.trim() !== "" ? name.trim() : fetched.filename;
      const result = await createArtifactFromBytes(userId, fetched.bytes, merged);
      if (!result.ok) {
        const detail = (await result.res.json().catch(() => null)) as {
          error?: { code?: unknown; message?: unknown };
        } | null;
        return errorResult(
          result.res.status,
          typeof detail?.error?.code === "string" ? detail.error.code : "UPLOAD_FAILED",
          typeof detail?.error?.message === "string" ? detail.error.message : "Upload failed",
        );
      }
      return jsonResult({ artifact: serializeArtifact(result.artifact) });
    },
  );

  server.tool(
    "list_artifacts",
    "List your artifacts, newest first",
    { limit: z.number().int().min(1).max(200).optional(), cursor: z.string().optional() },
    async ({ limit, cursor }) => {
      const page = await listArtifactsInternal(userId, cursor ?? null, limit ?? 50);
      if ("error" in page) {
        return errorResult(400, page.error.code, page.error.message);
      }
      return jsonResult(page);
    },
  );

  server.tool(
    "get_artifact",
    "Get one artifact with its share links",
    { artifactId: z.string().min(1) },
    async ({ artifactId }) => {
      const artifact = await Artifact.findOne({ artifactId, userId });
      if (!artifact) return errorResult(404, "NOT_FOUND", "Artifact not found");
      const links = await ShareLink.find({ artifactId }).sort({ createdAt: -1 });
      return jsonResult({
        artifact: serializeArtifact(artifact),
        shareLinks: links.map(serializeShareLink),
      });
    },
  );

  server.tool(
    "share_artifact",
    "Create a public share link for an artifact",
    { artifactId: z.string().min(1), expiresAt: z.string().optional() },
    async ({ artifactId, expiresAt }) => {
      const artifact = await Artifact.findOne({ artifactId, userId });
      if (!artifact) return errorResult(404, "NOT_FOUND", "Artifact not found");
      let expires: Date | null = null;
      if (expiresAt !== undefined) {
        expires = new Date(expiresAt);
        if (Number.isNaN(expires.getTime())) {
          return errorResult(400, "BAD_REQUEST", "expiresAt must be an ISO timestamp string");
        }
      }
      const link = await ShareLink.create({
        linkToken: c32hex(),
        artifactId,
        userId,
        expiresAt: expires,
      });
      recordEvent({ type: "share_created", userId, data: { linkId: link.linkId, artifactId } });
      return jsonResult({ shareLink: serializeShareLink(link) });
    },
  );

  server.tool(
    "unshare_artifact",
    "Revoke one of your share links",
    { linkId: z.string().min(1) },
    async ({ linkId }) => {
      const link = await ShareLink.findOne({ linkId, userId });
      if (!link) return errorResult(404, "NOT_FOUND", "Share link not found");
      if (link.revokedAt === null) {
        link.revokedAt = new Date();
        await link.save();
        recordEvent({ type: "share_revoked", userId, data: { linkId } });
      }
      return jsonResult({ revoked: true, linkId });
    },
  );

  server.tool(
    "delete_artifact",
    "Delete an artifact and all of its share links",
    { artifactId: z.string().min(1) },
    async ({ artifactId }) => {
      const artifact = await Artifact.findOne({ artifactId, userId });
      if (!artifact) return errorResult(404, "NOT_FOUND", "Artifact not found");
      await getStorage().remove(artifact.storageKey);
      await ShareLink.deleteMany({ artifactId });
      await artifact.deleteOne();
      recordEvent({ type: "artifact_deleted", userId, data: { artifactId } });
      return jsonResult({ deleted: true, artifactId });
    },
  );

  return server;
}

export async function POST(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Request body must be JSON");
  }

  const server = buildServer(token.userId);
  // Stateless: every request is self-contained (no Mcp-Session-Id handshake).
  // JSON responses keep the server proxy-friendly — no long-lived SSE streams.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    // NextRequest is a web-standard Request; parsedBody avoids a second body read.
    return await transport.handleRequest(req, { parsedBody });
  } catch (err: unknown) {
    return apiError(400, "BAD_REQUEST", err instanceof Error ? err.message : "Invalid MCP request");
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export async function GET() {
  return apiJson(405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "GET is not supported in stateless mode" },
  });
}

export async function DELETE() {
  return apiJson(405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "DELETE is not supported in stateless mode" },
  });
}
