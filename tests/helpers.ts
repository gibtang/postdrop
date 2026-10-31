import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MONGODB_MODULE_PATH, type ServerInfo } from "./global-setup";

// `mongodb` is resolved at runtime (see MONGODB_MODULE_PATH): it is not a
// root dependency, so its types are unavailable at author time. Minimal
// structural types cover everything the suite does.
interface UpdateResult {
  matchedCount: number;
}
interface MongoCollection {
  insertOne(doc: Record<string, unknown>): Promise<unknown>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<UpdateResult>;
}
interface MongoDb {
  collection(name: string): MongoCollection;
}
interface MongoClientLike {
  connect(): Promise<void>;
  close(): Promise<unknown>;
  db(name?: string): MongoDb;
}

const require = createRequire(import.meta.url);
const { MongoClient } = require(MONGODB_MODULE_PATH) as { MongoClient: new (uri: string) => MongoClientLike };

export const info: ServerInfo = JSON.parse(
  readFileSync(path.join(__dirname, ".server-info.json"), "utf8"),
) as ServerInfo; // known author-time shape written by globalSetup
export const BASE = info.baseUrl;
export const RUN = info.runId;
export const MAX_ARTIFACT_BYTES = info.maxArtifactBytes;
export const QUOTA_BYTES = info.quotaBytes;

let client: MongoClientLike;
let db: MongoDb;

export async function connectDb(): Promise<void> {
  if (db) return;
  client = new MongoClient(info.mongoUri);
  await client.connect();
  db = client.db();
}

export async function closeDb(): Promise<void> {
  if (client) await client.close();
}

export function collection(name: string): MongoCollection {
  return db.collection(name);
}

// ---------------------------------------------------------------------------
// Seeding (direct driver-level inserts matching the frozen contract shapes)
// ---------------------------------------------------------------------------

export interface SeedUser {
  userId: string;
  email: string;
  key: string;
  tokenId: string;
}

/** Bearer key in the wire format the API expects. */
export function makeKey(): string {
  return `pd_live_${randomBytes(32).toString("hex")}`;
}

export async function seedUser(email: string, name: string, key = makeKey()): Promise<SeedUser> {
  // Adapter convention: Token.userId is the STRINGIFIED users._id ObjectId.
  const { insertedId } = await collection("users").insertOne({
    email,
    emailVerified: new Date(),
    passwordHash: null,
    name,
    createdAt: new Date(),
  });
  return seedTokenForUser(String(insertedId), email, key);
}

export async function seedTokenForUser(
  userId: string,
  email: string,
  key: string,
): Promise<SeedUser> {
  const tokenId = randomUUID();
  await collection("tokens").insertOne({
    tokenId,
    userId,
    name: "acceptance-suite",
    keyHash: createHash("sha256").update(key).digest("hex"),
    keyPrefix: key.slice(0, 12),
    revokedAt: null,
    createdAt: new Date(),
  });
  return { userId, email, key, tokenId };
}

export async function revokeToken(tokenId: string): Promise<void> {
  await collection("tokens").updateOne(
    { tokenId },
    { $set: { revokedAt: new Date() } },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Real 1x1 transparent PNG. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Structurally minimal but valid-header PDF. */
export function pdfBytes(): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"),
    randomBytes(256),
  ]);
}

/** A second, visibly different PNG (2x1 red pixel header variant is fine for byte diffing). */
export function pngBytesAlt(): Buffer {
  return Buffer.concat([PNG_BYTES.subarray(0, 33), randomBytes(24), PNG_BYTES.subarray(33)]);
}

export function txtBytes(size = 64): Buffer {
  return Buffer.concat([Buffer.from("hello postdrop\n"), randomBytes(Math.max(0, size - 15))]);
}

export const HTML_BYTES = Buffer.from(
  "<!doctype html><html><body><h1>Report</h1><script>alert(1)</script></body></html>",
);

export const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/><script>alert(1)</script></svg>',
);

/** Not on the whitelist. */
export const DOCX_BYTES = Buffer.concat([
  Buffer.from("PK\x03\x04"),
  randomBytes(64),
]);

export function oversizedBytes(): Buffer {
  return randomBytes(MAX_ARTIFACT_BYTES + 1);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export interface ApiError {
  error: { code: string; message: string };
}

export function bearer(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

export async function upload(
  key: string,
  bytes: Buffer,
  opts: { filename: string; contentType: string; name?: string },
): Promise<Response> {
  const form = new FormData();
  // Buffer satisfies BlobPart at runtime; lib.dom's ArrayBufferView variance
  // rejects it under --strict, so bridge via Uint8Array view.
  form.append("file", new Blob([new Uint8Array(bytes)], { type: opts.contentType }), opts.filename);
  if (opts.name !== undefined) form.append("name", opts.name);
  return fetch(`${BASE}/v1/artifacts`, {
    method: "POST",
    headers: bearer(key),
    body: form,
  });
}

export async function patchArtifact(
  key: string,
  artifactId: string,
  bytes: Buffer,
  opts: { filename: string; contentType: string },
): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: opts.contentType }), opts.filename);
  return fetch(`${BASE}/v1/artifacts/${artifactId}`, {
    method: "PATCH",
    headers: bearer(key),
    body: form,
  });
}

export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
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

export async function createShare(
  key: string,
  artifactId: string,
  body?: { expiresAt?: string },
): Promise<Response> {
  return fetch(`${BASE}/v1/artifacts/${artifactId}/share`, {
    method: "POST",
    headers: { ...bearer(key), "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Storage introspection (disk driver)
// ---------------------------------------------------------------------------

/** Every file under the boot-time disk storage root. */
async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(p)));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

/** True if some file in disk storage contains exactly `bytes`. */
export async function storageHasExactBytes(bytes: Buffer): Promise<boolean> {
  const files = await walkFiles(info.storagePath);
  for (const file of files) {
    const data = await readFile(file);
    if (data.equals(bytes)) return true;
  }
  return false;
}

export async function storageFileCount(): Promise<number> {
  return (await walkFiles(info.storagePath)).length;
}
