import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage driver is not fully configured");
  }
  client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

const bucket = () => {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not configured");
  return b;
};

export const s3Storage = {
  async putStream(
    key: string,
    body: ReadableStream,
    opts: { contentType?: string; contentLength?: number },
  ): Promise<void> {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: Readable.fromWeb(body as NodeWebReadableStream),
        ContentType: opts.contentType,
        ContentLength: opts.contentLength,
      }),
    );
  },

  async getStream(key: string): Promise<ReadableStream> {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) throw new Error(`S3 object ${key} has no body`);
    return Readable.toWeb(res.Body as Readable) as ReadableStream;
  },

  async remove(key: string): Promise<void> {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? "application/octet-stream",
      };
    } catch (err: unknown) {
      if (err instanceof NotFound) return null;
      // Some S3 implementations signal a missing object with 404/412 metadata
      // on HeadObject instead of the typed NotFound error.
      if (err instanceof Error) {
        // AWS SDK service errors carry $metadata on a shape tsc cannot see.
        const service = err as Error & { $metadata?: { httpStatusCode?: number } };
        const status = service.$metadata?.httpStatusCode;
        if (status === 404 || status === 412) return null;
      }
      throw err;
    }
  },

  async presignPut(key: string, contentType: string): Promise<{ url: string }> {
    // The presigner and client-s3 resolve independent @smithy/core copies
    // (class identity differs), so bridge the nominal type here.
    const client = s3() as unknown as Parameters<typeof getSignedUrl>[0];
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
      { expiresIn: 15 * 60 },
    );
    return { url };
  },
};
