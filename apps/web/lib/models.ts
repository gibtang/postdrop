import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { newId } from "./ids";

/**
 * Auth.js v5 (MongoDB adapter) owns the core identity fields; passwordHash is
 * null for Google-only users. email is unique and lowercased.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Date, default: null },
    name: { type: String, default: null },
    image: { type: String, default: null },
    passwordHash: { type: String, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "users" },
);

const verificationTokenSchema = new Schema(
  {
    userId: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "verification_tokens" },
);
verificationTokenSchema.index({ userId: 1, purpose: 1 });

const tokenSchema = new Schema(
  {
    tokenId: { type: String, required: true, default: () => newId("tok_"), unique: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "tokens" },
);
tokenSchema.index({ userId: 1 });

const artifactSchema = new Schema(
  {
    artifactId: { type: String, required: true, default: () => newId("art_"), unique: true },
    userId: { type: String, required: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    updatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "artifacts" },
);
artifactSchema.index({ userId: 1, createdAt: -1 });

const shareLinkSchema = new Schema(
  {
    linkId: { type: String, required: true, default: () => newId("slnk_"), unique: true },
    linkToken: { type: String, required: true, unique: true },
    artifactId: { type: String, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
  },
  { collection: "share_links" },
);
shareLinkSchema.index({ artifactId: 1 });
shareLinkSchema.index({ userId: 1 });

const eventSchema = new Schema(
  {
    eventId: { type: String, required: true, default: () => newId("evt_"), unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "events" },
);
eventSchema.index({ userId: 1, createdAt: -1 });

const pasteSchema = new Schema(
  {
    pasteId: { type: String, required: true, default: () => newId("paste_"), unique: true },
    tokenHash: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["text", "file"], required: true },
    filename: { type: String, default: null },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, required: true },
    iv: { type: String, required: true },
    ciphertext: { type: Buffer, default: null },
    expiresAt: { type: Date, required: true },
    burnedAt: { type: Date, default: null },
    purgedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "pastes" },
);
pasteSchema.index({ expiresAt: 1 });

export type UserDoc = mongoose.HydratedDocument<InferSchemaType<typeof userSchema>>;
export type VerificationTokenDoc = mongoose.HydratedDocument<
  InferSchemaType<typeof verificationTokenSchema>
>;
export type TokenDoc = mongoose.HydratedDocument<InferSchemaType<typeof tokenSchema>>;
export type ArtifactDoc = mongoose.HydratedDocument<InferSchemaType<typeof artifactSchema>>;
export type ShareLinkDoc = mongoose.HydratedDocument<InferSchemaType<typeof shareLinkSchema>>;
export type EventDoc = mongoose.HydratedDocument<InferSchemaType<typeof eventSchema>>;
export type PasteDoc = mongoose.HydratedDocument<InferSchemaType<typeof pasteSchema>>;

export const User: Model<UserDoc> =
  mongoose.models.User ?? mongoose.model<UserDoc>("User", userSchema);
export const VerificationToken: Model<VerificationTokenDoc> =
  mongoose.models.VerificationToken ??
  mongoose.model<VerificationTokenDoc>("VerificationToken", verificationTokenSchema);
export const Token: Model<TokenDoc> =
  mongoose.models.Token ?? mongoose.model<TokenDoc>("Token", tokenSchema);
export const Artifact: Model<ArtifactDoc> =
  mongoose.models.Artifact ?? mongoose.model<ArtifactDoc>("Artifact", artifactSchema);
export const ShareLink: Model<ShareLinkDoc> =
  mongoose.models.ShareLink ?? mongoose.model<ShareLinkDoc>("ShareLink", shareLinkSchema);
export const Event: Model<EventDoc> =
  mongoose.models.Event ?? mongoose.model<EventDoc>("Event", eventSchema);
export const Paste: Model<PasteDoc> =
  mongoose.models.Paste ?? mongoose.model<PasteDoc>("Paste", pasteSchema);
