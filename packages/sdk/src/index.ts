import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

export class PostdropError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "PostdropError";
    this.status = status;
    this.code = code;
  }
}

export interface Artifact {
  artifactId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  linkId: string;
  url: string;
  expiresAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface Me {
  userId: string;
  email: string;
  name: string;
}

export interface ArtifactList {
  items: Artifact[];
  nextCursor: string | null;
}

export interface ArtifactDetail {
  artifact: Artifact;
  shareLinks: ShareLink[];
}

export interface UploadInput {
  file: Blob | Uint8Array | Buffer;
  name?: string;
  filename?: string;
  contentType?: string;
}

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  contentType: string;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export interface PostdropClientOptions {
  baseUrl: string;
  token: string;
}

const MULTIPART_MAX_BYTES = 4_500_000;

// Mirrors the server-side renderable-format whitelist. Packages must not
// import apps/web code, so the map is duplicated here.
const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  json: "application/json",
  csv: "text/csv",
  xml: "application/xml",
};

/** View a Buffer/Uint8Array as a BodyInit-compatible byte view. */
function toBytes(input: Uint8Array | Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    input.buffer as ArrayBuffer,
    input.byteOffset,
    input.byteLength,
  );
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function mimeFor(filename: string): string {
  const ext = extensionOf(filename);
  const mime = ext === "" ? undefined : EXTENSION_MIME[ext];
  if (mime === undefined) {
    throw new PostdropError(
      422,
      "UNSUPPORTED_FORMAT",
      `Unsupported file extension for "${filename}". Renderable formats: ` +
        Object.keys(EXTENSION_MIME).join(", "),
    );
  }
  return mime;
}

/**
 * Keeps a custom display name uploadable: when it lacks a renderable
 * extension, the source file's extension is appended ("Q4 report" +
 * report.pdf → "Q4 report.pdf").
 */
export function ensureRenderableName(name: string, sourceFilename: string): string {
  const ext = extensionOf(name);
  if (ext !== "" && EXTENSION_MIME[ext] !== undefined) return name;
  const srcExt = extensionOf(sourceFilename);
  return srcExt !== "" ? `${name}.${srcExt}` : name;
}

export class PostdropClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor({ baseUrl, token }: PostdropClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async me(): Promise<Me> {
    return (await this.requestJson("GET", "/v1/me")) as Me;
  }

  async upload(
    input: Blob | Uint8Array | Buffer,
    opts: Omit<UploadInput, "file"> = {},
  ): Promise<Artifact> {
    return await this.put("POST", "/v1/artifacts", input, opts);
  }

  async edit(
    artifactId: string,
    input: Blob | Uint8Array | Buffer,
    opts: Omit<UploadInput, "file"> = {},
  ): Promise<Artifact> {
    return await this.put(
      "PATCH",
      `/v1/artifacts/${artifactId}`,
      input,
      opts,
    );
  }

  async list(opts?: { cursor?: string; limit?: number }): Promise<ArtifactList> {
    const params = new URLSearchParams();
    if (opts?.cursor !== undefined) params.set("cursor", opts.cursor);
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return (await this.requestJson(
      "GET",
      `/v1/artifacts${qs ? `?${qs}` : ""}`,
    )) as ArtifactList;
  }

  async get(artifactId: string): Promise<ArtifactDetail> {
    return (await this.requestJson(
      "GET",
      `/v1/artifacts/${artifactId}`,
    )) as ArtifactDetail;
  }

  async remove(artifactId: string): Promise<void> {
    await this.requestVoid("DELETE", `/v1/artifacts/${artifactId}`);
  }

  async share(
    artifactId: string,
    opts?: { expiresAt?: string },
  ): Promise<ShareLink> {
    const body = opts?.expiresAt !== undefined
      ? JSON.stringify({ expiresAt: opts.expiresAt })
      : undefined;
    const res = (await this.requestJson(
      "POST",
      `/v1/artifacts/${artifactId}/share`,
      {
        "content-type": "application/json",
      },
      body,
    )) as { shareLink: ShareLink };
    return res.shareLink;
  }

  async listShares(): Promise<{ items: ShareLink[] }> {
    return (await this.requestJson("GET", "/v1/share")) as {
      items: ShareLink[];
    };
  }

  async unshare(linkId: string): Promise<void> {
    await this.requestVoid("DELETE", `/v1/share/${linkId}`);
  }

  /** Raw artifact content. The CLI streams this to disk. */
  async raw(artifactId: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/v1/artifacts/${artifactId}/raw`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) await this.raise(res);
    return res;
  }

  private async put(
    method: "POST" | "PATCH",
    path: string,
    input: Blob | Uint8Array | Buffer,
    opts: Omit<UploadInput, "file">,
  ): Promise<Artifact> {
    const filename = opts.filename ?? opts.name ?? "file";
    const byteLength =
      input instanceof Blob ? input.size : input.byteLength;

    if (byteLength <= MULTIPART_MAX_BYTES) {
      const form = new FormData();
      const blob = input instanceof Blob
        ? input
        : new Blob([toBytes(input)], {
          type: opts.contentType ?? mimeFor(filename),
        });
      form.set("file", blob, filename);
      if (opts.name !== undefined) form.set("name", opts.name);
      const body = (await this.requestJson(method, path, {}, form)) as {
        artifact: Artifact;
      };
      return body.artifact;
    }

    const contentType = opts.contentType ?? mimeFor(filename);
    const presign = (await this.requestJson(
      "POST",
      "/v1/uploads/presign",
      { "content-type": "application/json" },
      JSON.stringify({ filename, contentType, size: byteLength }),
    )) as PresignResponse;

    const putBody = input instanceof Blob ? await input.arrayBuffer() : toBytes(input);
    const putRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "content-type": presign.contentType },
      body: putBody,
    });
    if (!putRes.ok) {
      throw new PostdropError(
        putRes.status,
        "UPLOAD_FAILED",
        `Presigned upload failed with status ${putRes.status}`,
      );
    }

    const completed = (await this.requestJson(
      "POST",
      "/v1/uploads/complete",
      { "content-type": "application/json" },
      JSON.stringify({ key: presign.key, filename }),
    )) as { artifact: Artifact };
    return completed.artifact;
  }

  private async requestJson(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: BodyInit,
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...headers },
      body,
    });
    if (res.status === 204) return undefined;
    return await this.parse(res);
  }

  private async requestVoid(method: string, path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) await this.raise(res);
  }

  private async parse(res: Response): Promise<unknown> {
    if (!res.ok) await this.raise(res);
    return await res.json();
  }

  private async raise(res: Response): Promise<never> {
    let code = "UNKNOWN";
    let message: string | undefined;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.error?.code === "string") code = body.error.code;
      if (typeof body.error?.message === "string") message = body.error.message;
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new PostdropError(res.status, code, message ?? res.statusText);
  }
}

export async function saveRaw(res: Response, destPath: string): Promise<string> {
  if (res.body === null) {
    throw new PostdropError(502, "EMPTY_RESPONSE", "No body in raw stream");
  }
  await pipeline(
    Readable.fromWeb(res.body as NodeWebReadableStream),
    createWriteStream(destPath),
  );
  return destPath;
}

export default PostdropClient;
