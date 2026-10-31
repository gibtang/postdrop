"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { Artifact, ShareLink, Token } from "./models";
import type { ArtifactDoc } from "./models";
import {
  checkQuota,
  checkUploadFormat,
  createArtifactFromBytes,
  maxArtifactBytes,
  serializeShareLink,
} from "./api";
import { requireUser } from "./auth-user";
import { connectDb } from "./db";
import { serializeForDashboard } from "./dashboard-serialize";
import { mimeForFilename } from "./formats";
import { c32hex, newId, newToken } from "./ids";
import { artifactKey, getStorage } from "./storage/index";
import { recordEvent } from "./events";
import { toWebStream } from "./api";

import type { ArtifactSummary, ShareLinkSummary } from "./dashboard-serialize";

export type { ArtifactSummary, ShareLinkSummary };
export type ActionError = { ok: false; error: string };
export type ActionOk<T> = { ok: true } & T;

const KEY_PATTERN = /^artifacts\/(art_[0-9a-f]{32})\/([A-Za-z0-9._-]{1,200})$/;

function fail(error: string): ActionError {
  return { ok: false, error };
}

function revalidateDashboard(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tokens");
  revalidatePath("/dashboard/links");
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/** ≤ ~4MB path: multipart through the server action. */
export async function uploadArtifactAction(
  formData: FormData,
): Promise<ActionOk<{ artifact: ArtifactSummary }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("No file selected.");
  const nameField = formData.get("name");
  const filename = typeof nameField === "string" && nameField !== "" ? nameField : file.name;

  const bytes = Buffer.from(await file.arrayBuffer());
  await connectDb();
  const result = await createArtifactFromBytes(String(user._id), bytes, filename);
  if (!result.ok) return fail(resultMessage(result.res.status));
  revalidateDashboard();
  return { ok: true, artifact: serializeForDashboard(result.artifact) };
}

/** Maps API error statuses to human messages for inline display. */
function resultMessage(status: number): string {
  if (status === 413) return "File exceeds the per-file size limit.";
  if (status === 422) return "Unsupported format or storage quota exceeded.";
  if (status === 401) return "You must be signed in.";
  return "Upload failed. Please try again.";
}

export interface PresignResult {
  uploadUrl: string;
  key: string;
  filename: string;
  /** Derived server-side from the filename; the browser PUT must send it. */
  contentType: string;
}

/** >4MB path step 1: get a direct-to-storage PUT URL. */
export async function requestPresignAction(input: {
  filename: string;
  size: number;
}): Promise<ActionOk<PresignResult> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const { filename, size } = input;
  if (typeof filename !== "string" || filename === "") return fail("No file selected.");
  const format = checkUploadFormat(filename, size);
  if (!format.ok) return fail(format.message);
  await connectDb();
  const quota = await checkQuota(String(user._id), size);
  if (!quota.ok) return fail(quota.message);

  const key = artifactKey(newId("art_"), filename);
  let uploadUrl: string;
  try {
    uploadUrl = (await getStorage().presignPut(key, format.contentType)).url;
  } catch {
    return fail("Direct upload is not available on this storage driver.");
  }
  return { ok: true, uploadUrl, key, filename, contentType: format.contentType };
}

/** >4MB path step 2: register the uploaded object as a new artifact. */
export async function completeUploadAction(input: {
  key: string;
  filename: string;
}): Promise<ActionOk<{ artifact: ArtifactSummary }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const { key, filename } = input;
  if (typeof key !== "string" || typeof filename !== "string" || filename === "") {
    return fail("Invalid upload completion request.");
  }
  const match = KEY_PATTERN.exec(key);
  if (!match) return fail("Invalid upload key.");
  const contentType = mimeForFilename(filename);
  if (contentType === null) return fail(`Unsupported file extension for "${filename}".`);

  await connectDb();
  const head = await getStorage().head(key);
  if (!head) return fail("Uploaded object not found in storage.");
  const max = maxArtifactBytes();
  if (head.size > max) return fail(`Uploaded file is too large (limit is ${max} bytes).`);
  const quota = await checkQuota(String(user._id), head.size);
  if (!quota.ok) return fail(quota.message);

  const now = new Date();
  const artifact = await Artifact.create({
    artifactId: match[1],
    userId: String(user._id),
    filename,
    contentType,
    size: head.size,
    storageKey: key,
    createdAt: now,
    updatedAt: now,
  });
  recordEvent({
    type: "artifact_uploaded",
    userId: String(user._id),
    data: { artifactId: match[1], filename, size: head.size, via: "dashboard" },
  });
  revalidateDashboard();
  return { ok: true, artifact: serializeForDashboard(artifact) };
}

/** Replace an artifact's file, ≤ ~4MB, in one action. */
export async function editArtifactAction(
  formData: FormData,
): Promise<ActionOk<{ artifact: ArtifactSummary }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const artifactId = formData.get("artifactId");
  const file = formData.get("file");
  if (typeof artifactId !== "string" || !(file instanceof File)) return fail("No file selected.");
  const nameField = formData.get("name");
  const filename = typeof nameField === "string" && nameField !== "" ? nameField : file.name;

  await connectDb();
  const artifact = await Artifact.findOne({ artifactId, userId: String(user._id) });
  if (!artifact) return fail("Artifact not found.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const format = checkUploadFormat(filename, bytes.byteLength);
  if (!format.ok) return fail(format.message);
  const quota = await checkQuota(String(user._id), bytes.byteLength - artifact.size);
  if (!quota.ok) return fail(quota.message);

  await getStorage().putStream(artifact.storageKey, toWebStream(bytes), {
    contentType: format.contentType,
    contentLength: bytes.byteLength,
  });
  artifact.filename = filename;
  artifact.contentType = format.contentType;
  artifact.size = bytes.byteLength;
  artifact.updatedAt = new Date();
  await artifact.save();
  recordEvent({
    type: "artifact_edited",
    userId: String(user._id),
    data: { artifactId, filename, size: bytes.byteLength, via: "dashboard" },
  });
  revalidateDashboard();
  return { ok: true, artifact: serializeForDashboard(artifact) };
}

/** Replace an artifact's file, >4MB, after a presigned browser PUT. */
export async function completeEditAction(input: {
  artifactId: string;
  key: string;
  filename: string;
}): Promise<ActionOk<{ artifact: ArtifactSummary }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const { artifactId, key, filename } = input;
  if (!KEY_PATTERN.test(key)) return fail("Invalid upload key.");
  const contentType = mimeForFilename(filename);
  if (contentType === null) return fail(`Unsupported file extension for "${filename}".`);

  await connectDb();
  const artifact = await Artifact.findOne({ artifactId, userId: String(user._id) });
  if (!artifact) return fail("Artifact not found.");
  const head = await getStorage().head(key);
  if (!head) return fail("Uploaded object not found in storage.");
  const max = maxArtifactBytes();
  if (head.size > max) return fail(`Uploaded file is too large (limit is ${max} bytes).`);
  const quota = await checkQuota(String(user._id), head.size - artifact.size);
  if (!quota.ok) return fail(quota.message);

  // Remove the previous object only when the replacement lives at a new key.
  if (artifact.storageKey !== key) {
    await getStorage().remove(artifact.storageKey).catch(() => undefined);
  }
  artifact.storageKey = key;
  artifact.filename = filename;
  artifact.contentType = contentType;
  artifact.size = head.size;
  artifact.updatedAt = new Date();
  await artifact.save();
  recordEvent({
    type: "artifact_edited",
    userId: String(user._id),
    data: { artifactId, filename, size: head.size, via: "dashboard-presign" },
  });
  revalidateDashboard();
  return { ok: true, artifact: serializeForDashboard(artifact) };
}

export async function deleteArtifactAction(
  artifactId: string,
): Promise<ActionOk<{ deleted: true }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  await connectDb();
  const artifact = await Artifact.findOne({ artifactId, userId: String(user._id) });
  if (!artifact) return fail("Artifact not found.");
  await getStorage().remove(artifact.storageKey);
  await ShareLink.deleteMany({ artifactId });
  await artifact.deleteOne();
  recordEvent({ type: "artifact_deleted", userId: String(user._id), data: { artifactId } });
  revalidateDashboard();
  return { ok: true, deleted: true };
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export interface CreatedShareLink {
  link: ShareLinkSummary;
}

export async function createShareLinkAction(input: {
  artifactId: string;
  expiresInDays: number | null;
}): Promise<ActionOk<CreatedShareLink> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  const { artifactId, expiresInDays } = input;
  await connectDb();
  const artifact = await Artifact.findOne({ artifactId, userId: String(user._id) });
  if (!artifact) return fail("Artifact not found.");
  let expiresAt: Date | null = null;
  if (expiresInDays !== null) {
    if (!Number.isInteger(expiresInDays) || expiresInDays <= 0) {
      return fail("Invalid expiry.");
    }
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }
  const link = await ShareLink.create({
    linkToken: c32hex(),
    artifactId,
    userId: String(user._id),
    expiresAt,
  });
  recordEvent({ type: "share_created", userId: String(user._id), data: { linkId: link.linkId, artifactId } });
  revalidateDashboard();
  return { ok: true, link: serializeShareLink(link) };
}

export async function revokeShareLinkAction(
  linkId: string,
): Promise<ActionOk<{ revoked: true }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  await connectDb();
  const link = await ShareLink.findOne({ linkId, userId: String(user._id) });
  if (!link) return fail("Share link not found.");
  if (link.revokedAt === null) {
    link.revokedAt = new Date();
    await link.save();
    recordEvent({ type: "share_revoked", userId: String(user._id), data: { linkId } });
  }
  revalidateDashboard();
  return { ok: true, revoked: true };
}

// ---------------------------------------------------------------------------
// API tokens
// ---------------------------------------------------------------------------

export interface CreatedToken {
  tokenId: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  /** Plaintext, returned exactly once. */
  token: string;
}

export async function createTokenAction(
  name: string,
): Promise<ActionOk<{ created: CreatedToken }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");
  if (typeof name !== "string" || name.trim() === "") return fail("Token name is required.");

  await connectDb();
  const { token, tokenHash, tokenPrefix } = newToken();
  const doc = await Token.create({
    userId: String(user._id),
    name: name.trim(),
    keyHash: tokenHash,
    keyPrefix: tokenPrefix,
  });
  recordEvent({ type: "token_created", userId: String(user._id), data: { tokenId: doc.tokenId } });
  revalidatePath("/dashboard/tokens");
  return {
    ok: true,
    created: {
      tokenId: doc.tokenId,
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      createdAt: doc.createdAt.toISOString(),
      token,
    },
  };
}

export async function revokeTokenAction(
  tokenId: string,
): Promise<ActionOk<{ revoked: true }> | ActionError> {
  const user = await requireUser();
  if (!user) return fail("You must be signed in.");

  await connectDb();
  const doc = await Token.findOne({ tokenId, userId: String(user._id) });
  if (!doc) return fail("Token not found.");
  if (doc.revokedAt === null) {
    doc.revokedAt = new Date();
    await doc.save();
  }
  revalidatePath("/dashboard/tokens");
  return { ok: true, revoked: true };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
