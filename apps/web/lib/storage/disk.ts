import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { mimeForFilename } from "../formats";

const root = () => {
  const dir = process.env.DISK_STORAGE_PATH;
  if (!dir) throw new Error("DISK_STORAGE_PATH is not configured");
  return path.resolve(dir);
};

function keyPath(key: string): string {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("invalid storage key");
  return full;
}

export const diskStorage = {
  async putStream(
    key: string,
    body: ReadableStream,
    opts: { contentType?: string; contentLength?: number },
  ): Promise<void> {
    const dest = keyPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(body as NodeWebReadableStream), createWriteStream(dest));
    if (opts.contentLength !== undefined) {
      const { size } = await stat(dest);
      if (size !== opts.contentLength) {
        await unlink(dest).catch(() => {});
        throw new Error(`disk write size mismatch: expected ${opts.contentLength}, got ${size}`);
      }
    }
  },

  async getStream(key: string): Promise<ReadableStream> {
    return Readable.toWeb(createReadStream(keyPath(key))) as ReadableStream;
  },

  async remove(key: string): Promise<void> {
    await unlink(keyPath(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  },

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const { size } = await stat(keyPath(key));
      const base = key.split("/").pop() ?? "";
      return { size, contentType: mimeForFilename(base) ?? "application/octet-stream" };
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
      throw err;
    }
  },

  async presignPut(): Promise<{ url: string }> {
    throw new Error("presignPut requires STORAGE_DRIVER=s3");
  },
};
