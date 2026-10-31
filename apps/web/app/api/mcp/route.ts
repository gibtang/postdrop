import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import {
  apiError,
  apiJson,
  checkQuota,
  createArtifactFromBytes,
  checkUploadFormat,
  maxArtifactBytes,
  serializeArtifact,
  serializeShareLink,
} from "@/lib/api";
import { getStorage } from "@/lib/storage/index";
import { c32hex } from "@/lib/ids";
import { recordEvent } from "@/lib/events";

/**
 * Minimal Node HTTP primitives for the MCP SDK's StreamableHTTP transport,
 * which duck-types IncomingMessage/ServerResponse. This adapter is only ever
 * handed to the SDK, never to node's http server.
 */
type NodeReq = Readable & IncomingMessage;

function makeNodeRes(): { res: ServerResponse; body: () => Buffer; whenDone: Promise<void> } {
  const chunks: Buffer[] = [];
  const emitter = new EventEmitter() as ServerResponse & EventEmitter;
  // Promise.withResolvers is unavailable under this tsconfig lib target.
  let done: () => void;
  const promise = new Promise<void>((resolve) => {
    done = resolve;
  });
  const headers: Record<string, string> = {};
  Object.assign(emitter, {
    statusCode: 200,
    statusMessage: "OK",
    writeHead(status: number, init?: Record<string, string> | string[]) {
      emitter.statusCode = status;
      if (Array.isArray(init)) {
        for (let i = 0; i < init.length; i += 2) headers[init[i].toLowerCase()] = init[i + 1];
      } else if (init) {
        for (const [k, v] of Object.entries(init)) headers[k.toLowerCase()] = String(v);
      }
      return emitter;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
      return emitter;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
    getHeaders() {
      return { ...headers };
    },
    flushHeaders() {},
    write(chunk: unknown) {
      chunks.push(Buffer.from(chunk as Uint8Array));
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk as Uint8Array));
      done();
      return emitter;
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      emitter.addListener(event, listener);
      return emitter;
    },
  });
  return {
    res: emitter,
    body: () => Buffer.concat(chunks),
    whenDone: promise,
  };
}

function makeNodeReq(req: Request, parsedBody: unknown): NodeReq {
  const passthrough = new Readable({ read() {} });
  // The MCP transport duck-types IncomingMessage; feed it the already-parsed
  // body via the stream it will consume.
  passthrough.push(JSON.stringify(parsedBody));
  passthrough.push(null);
  return Object.assign(passthrough, {
    method: req.method,
    url: new URL(req.url).pathname,
    headers: Object.fromEntries(req.headers.entries()),
  }) as NodeReq;
}

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
      const display = name ?? filename;
      const format = checkUploadFormat(display, bytes.byteLength);
      if (!format.ok) return errorResult(format.status, format.code, format.message);
      const quota = await checkQuota(userId, bytes.byteLength);
      if (!quota.ok) return errorResult(quota.status, quota.code, quota.message);
      const result = await createArtifactFromBytes(userId, bytes, display);
      if (!result.ok) return errorResult(500, "UPLOAD_FAILED", "Upload failed");
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
      const display = name ?? fetched.filename;
      const format = checkUploadFormat(display, fetched.bytes.byteLength);
      if (!format.ok) return errorResult(format.status, format.code, format.message);
      const quota = await checkQuota(userId, fetched.bytes.byteLength);
      if (!quota.ok) return errorResult(quota.status, quota.code, quota.message);
      const result = await createArtifactFromBytes(userId, fetched.bytes, display);
      if (!result.ok) return errorResult(500, "UPLOAD_FAILED", "Upload failed");
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
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const { res: nodeRes, body, whenDone } = makeNodeRes();
  try {
    await server.connect(transport);
    await transport.handleRequest(makeNodeReq(req, parsedBody), nodeRes, parsedBody);
    await whenDone;
  } catch (err: unknown) {
    return apiError(400, "BAD_REQUEST", err instanceof Error ? err.message : "Invalid MCP request");
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(nodeRes.getHeaders())) {
    if (typeof v === "string") headers[k] = v;
  }
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  delete headers["connection"];
  delete headers["keep-alive"];
  return apiJsonRaw(nodeRes.statusCode, body(), headers);
}

function apiJsonRaw(status: number, body: Buffer, headers: Record<string, string>): Response {
  return new Response(new Uint8Array(body), { status, headers });
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
