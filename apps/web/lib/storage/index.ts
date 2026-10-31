import { diskStorage } from "./disk";
import { s3Storage } from "./s3";

export interface Storage {
  putStream(
    key: string,
    body: ReadableStream,
    opts: { contentType?: string; contentLength?: number },
  ): Promise<void>;
  getStream(key: string): Promise<ReadableStream>;
  remove(key: string): Promise<void>;
  /** Object metadata without reading the body; null when the key is absent. */
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  /** Short-lived direct-to-storage PUT URL for client-side uploads. */
  presignPut(key: string, contentType: string): Promise<{ url: string }>;
}

export function getStorage(): Storage {
  const driver = process.env.STORAGE_DRIVER || "disk";
  if (driver === "s3") return s3Storage;
  if (driver === "disk") return diskStorage;
  throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
}

/** Keep basenames safe for both disk paths and Content-Disposition. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 200);
}

export function artifactKey(artifactId: string, filename: string): string {
  return `artifacts/${artifactId}/${sanitizeFilename(filename)}`;
}
