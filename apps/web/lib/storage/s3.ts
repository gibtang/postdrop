import { AwsClient } from "aws4fetch";

// aws4fetch (fetch-based SigV4) instead of @aws-sdk/client-s3: the AWS SDK's
// data plane needs node:fs (shared INI config) and node stream chunked
// encoding during config resolution/streaming, neither of which exists on
// Cloudflare Workers (`[unenv] fs.readFile is not implemented yet!`).

let client: AwsClient | null = null;

function s3(): AwsClient {
  if (client) return client;
  const { S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage driver is not fully configured");
  }
  client = new AwsClient({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION,
    service: "s3",
  });
  return client;
}

const bucket = () => {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not configured");
  return b;
};

/** Path-style URL for an object; each key segment URI-encoded. */
function objectUrl(key: string): string {
  const endpoint =
    process.env.S3_ENDPOINT || `https://s3.${process.env.S3_REGION}.amazonaws.com`;
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${endpoint.replace(/\/+$/, "")}/${bucket()}/${encoded}`;
}

async function readAll(body: ReadableStream): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const s3Storage = {
  async putStream(
    key: string,
    body: ReadableStream,
    opts: { contentType?: string; contentLength?: number },
  ): Promise<void> {
    const bytes = await readAll(body);
    if (opts.contentLength !== undefined && bytes.byteLength !== opts.contentLength) {
      throw new Error(
        `s3 put size mismatch: expected ${opts.contentLength}, got ${bytes.byteLength}`,
      );
    }
    const res = await s3().fetch(objectUrl(key), {
      method: "PUT",
      headers: {
        "content-type": opts.contentType ?? "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`s3 put failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
  },

  async getStream(key: string): Promise<ReadableStream> {
    const res = await s3().fetch(objectUrl(key), { method: "GET" });
    if (!res.ok) throw new Error(`s3 get failed (HTTP ${res.status})`);
    if (!res.body) throw new Error(`s3 object ${key} has no body`);
    return res.body;
  },

  async getRange(key: string, start: number, end: number): Promise<ReadableStream | null> {
    const res = await s3().fetch(objectUrl(key), {
      method: "GET",
      headers: { range: `bytes=${start}-${end}` },
    });
    if (res.status === 404 || res.status === 416) return null;
    if (!res.ok) throw new Error(`s3 range get failed (HTTP ${res.status})`);
    if (!res.body) throw new Error(`s3 object ${key} has no body`);
    return res.body;
  },

  async remove(key: string): Promise<void> {
    const res = await s3().fetch(objectUrl(key), { method: "DELETE" });
    // 404 is fine: deleting an absent object is a no-op for our purposes.
    if (!res.ok && res.status !== 404) {
      throw new Error(`s3 delete failed (HTTP ${res.status})`);
    }
  },

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    // Range-GET instead of HEAD: B2's S3 endpoint 403s signed HEAD requests
    // for some application keys while PUT/GET with the same key succeed.
    // `bytes=0-0` costs one small request and `Content-Range` carries size.
    const res = await s3().fetch(objectUrl(key), {
      method: "GET",
      headers: { range: "bytes=0-0" },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`s3 head failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    // Consume (not cancel) the body: cancelling an unconsumed undici stream
    // deadlocks the fetch under Node, hanging the caller.
    await res.arrayBuffer();
    const total = res.headers.get("content-range")?.split("/")[1];
    return {
      size: Number(total ?? res.headers.get("content-length") ?? 0),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  },

  async presignPut(key: string, contentType: string): Promise<{ url: string }> {
    // Query-signed PUT URL; 15 minutes. Expiry must be a URL parameter (not a
    // request header): aws4fetch signs leftover headers as-is, and B2 rejects
    // a presigned request whose signed `x-amz-expires` header is absent.
    // `content-type` is auto-excluded from signing by aws4fetch, so the
    // browser just has to send the same value for B2 to store it.
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", "900");
    const request = new Request(url, { method: "PUT", headers: { "content-type": contentType } });
    const signed = await s3().sign(request, { aws: { signQuery: true } });
    return { url: signed.url };
  },
};
