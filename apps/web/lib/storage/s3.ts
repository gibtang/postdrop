import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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
};
