import { createReadStream, createWriteStream } from "node:fs";
import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
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

export interface SendOptions {
  recipientEmail: string;
  ttlHours?: number;
  filename?: string;
}

export interface DropSummary {
  dropId: string;
  status: "pending" | "answered" | "expired";
  recipientEmail: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
  hasReply: boolean;
  hasEdit: boolean;
}

export interface DropList {
  drops: DropSummary[];
  nextCursor?: string;
}

export interface DropResult {
  dropId: string;
  status: "pending" | "answered" | "expired";
  replyText?: string;
  edit?: { filename: string; sizeBytes: number };
}

export interface SendResponse {
  dropId: string;
  linkUrl: string;
  expiresAt: string;
  filename: string;
  sizeBytes: number;
}

export interface RevokeResponse {
  dropId: string;
  status: "expired";
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export interface PostdropClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class PostdropClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor({ baseUrl, apiKey }: PostdropClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async send(
    file: string | Buffer | ReadableStream<Uint8Array>,
    { recipientEmail, ttlHours, filename }: SendOptions,
  ): Promise<SendResponse> {
    let body: BodyInit;
    let name: string;
    let contentLength: string | undefined;

    if (typeof file === "string") {
      const stats: Stats = await stat(file);
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${file}`);
      }
      body = Readable.toWeb(
        createReadStream(file),
      ) as ReadableStream<Uint8Array>;
      name = filename ?? basename(file);
      contentLength = String(stats.size);
    } else if (Buffer.isBuffer(file)) {
      body = new Uint8Array(file);
      name = filename ?? "file";
      contentLength = String(file.byteLength);
    } else {
      body = file;
      name = filename ?? "file";
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "x-filename": name,
      "x-recipient-email": recipientEmail,
    };
    if (ttlHours !== undefined) headers["x-ttl-hours"] = String(ttlHours);
    if (contentLength !== undefined) headers["content-length"] = contentLength;

    const res = await fetch(`${this.baseUrl}/v1/drops`, {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit);
    return (await this.parse(res)) as SendResponse;
  }

  async get(id: string): Promise<DropSummary> {
    return (await this.requestJson("GET", `/v1/drops/${id}`)) as DropSummary;
  }

  async result(id: string): Promise<DropResult> {
    return (await this.requestJson(
      "GET",
      `/v1/drops/${id}/result`,
    )) as DropResult;
  }

  async list(opts?: { limit?: number; cursor?: string }): Promise<DropList> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.cursor !== undefined) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return (await this.requestJson(
      "GET",
      `/v1/drops${qs ? `?${qs}` : ""}`,
    )) as DropList;
  }

  async downloadEdit(id: string, destPath?: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/drops/${id}/edit`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) await this.raise(res);

    let dest = destPath;
    if (dest === undefined) {
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
      dest = match ? decodeURIComponent(match[1]!) : `${id}-edit`;
    }

    if (res.body === null) {
      throw new PostdropError(502, "EMPTY_RESPONSE", "No body in edit stream");
    }
    await pipeline(
      Readable.fromWeb(res.body as NodeWebReadableStream),
      createWriteStream(dest),
    );
    return dest;
  }

  async revoke(id: string): Promise<RevokeResponse> {
    return (await this.requestJson(
      "POST",
      `/v1/drops/${id}/revoke`,
    )) as RevokeResponse;
  }

  private async requestJson(
    method: string,
    path: string,
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    return await this.parse(res);
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
      // non-JSON error body: keep defaults
    }
    throw new PostdropError(res.status, code, message);
  }
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

export default PostdropClient;
