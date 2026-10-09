import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { newId } from "./ids";

const accountSchema = new Schema(
  {
    accountId: { type: String, required: true, default: () => newId("acct_"), unique: true },
    email: { type: String, required: true, unique: true },
    firebaseUid: { type: String, default: null },
    passwordHash: { type: String },
    tier: { type: String, enum: ["free"], required: true, default: "free" },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "accounts" },
);
accountSchema.index({ firebaseUid: 1 }, { unique: true, sparse: true });

const agentSchema = new Schema(
  {
    agentId: { type: String, required: true, default: () => newId("agnt_"), unique: true },
    accountId: { type: String, required: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    revokedAt: { type: Date },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "agents" },
);
agentSchema.index({ accountId: 1 });

const dropSchema = new Schema(
  {
    dropId: { type: String, required: true, default: () => newId("drop_"), unique: true },
    accountId: { type: String, required: true },
    agentId: { type: String, required: true },
    recipientEmail: { type: String, required: true },
    filename: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true, default: "application/octet-stream" },
    storageKey: { type: String, default: null },
    status: { type: String, enum: ["pending", "answered", "expired"], required: true, default: "pending" },
    linkTokenHash: { type: String, required: true, unique: true },
    replyText: { type: String, default: null },
    editStorageKey: { type: String, default: null },
    editFilename: { type: String, default: null },
    editSizeBytes: { type: Number, default: null },
    editMimeType: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    answeredAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    purgedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "drops" },
);
dropSchema.index({ agentId: 1, createdAt: -1 });
dropSchema.index({ status: 1, expiresAt: 1 });
dropSchema.index({ accountId: 1, createdAt: -1 });

export type AccountDoc = mongoose.HydratedDocument<InferSchemaType<typeof accountSchema>>;
export type AgentDoc = mongoose.HydratedDocument<InferSchemaType<typeof agentSchema>>;
export type DropDoc = mongoose.HydratedDocument<InferSchemaType<typeof dropSchema>>;

export const Account: Model<AccountDoc> =
  mongoose.models.Account ?? mongoose.model<AccountDoc>("Account", accountSchema);
export const Agent: Model<AgentDoc> =
  mongoose.models.Agent ?? mongoose.model<AgentDoc>("Agent", agentSchema);
export const Drop: Model<DropDoc> =
  mongoose.models.Drop ?? mongoose.model<DropDoc>("Drop", dropSchema);
