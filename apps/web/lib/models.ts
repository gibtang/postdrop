import { Document, ObjectId } from "mongodb";
import { newId } from "./ids";
import { getDb } from "./db";

/**
 * Mongoose-free data layer backed by the raw `mongodb` driver. The exported
 * models keep the shapes and call-sites of the previous mongoose models
 * (findOne/find/create/updateOne/updateMany/deleteMany/findOneAndUpdate/
 * findById/aggregate, chainable sort/limit, .lean(), doc.save()), so route
 * code is unchanged.
 */

function castId(value: unknown): unknown {
  // Users (via the Auth.js MongoDB adapter) store ObjectId _ids; every other
  // collection inherited them from mongoose's default _id.
  if (typeof value === "string" && /^[0-9a-f]{24}$/i.test(value)) {
    return new ObjectId(value);
  }
  return value;
}

function castFilter(filter: Record<string, unknown>): Record<string, unknown> {
  if (!("_id" in filter)) return filter;
  return { ...filter, _id: castId(filter._id) };
}

/** BSON Binary comes back as a Uint8Array subclass; hand callers a Buffer. */
function normalizeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return Buffer.from(value);
  // bson's Binary does not subclass Uint8Array on all driver versions; the
  // valid bytes are buffer[0..position) (the rest is 4-byte-alignment padding).
  const binary = value as { _bsontype?: string; buffer?: Uint8Array; position?: number } | null;
  if (binary?._bsontype === "Binary" && binary.buffer instanceof Uint8Array) {
    return Buffer.from(
      binary.buffer.buffer,
      binary.buffer.byteOffset,
      binary.position ?? binary.buffer.byteLength,
    );
  }
  return value;
}

type AnyDoc = Record<string, unknown> & { _id: ObjectId };

function attachSave<T>(doc: NonNullable<T>, collectionName: string): NonNullable<T> {
  const target = doc as unknown as AnyDoc;
  Object.defineProperty(target, "save", {
    value: async () => {
      const { save: _save, ...rest } = target;
      await (await getDb()).collection(collectionName).replaceOne({ _id: target._id }, rest);
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(target, "deleteOne", {
    value: async () => {
      const col = await getDb().then((d) => d.collection(collectionName));
      await col.deleteOne({ _id: target._id });
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return doc;
}

/** Normalizes BSON values (Binary→Buffer) and attaches save() to fetched docs. */
function normalizeDocs<T>(docs: (AnyDoc | null)[], collectionName: string): T[] {
  const out: T[] = [];
  for (const doc of docs) {
    if (!doc) continue;
    const clean = { ...doc };
    for (const key of Object.keys(clean)) clean[key] = normalizeValue(clean[key]);
    out.push(attachSave<T>(clean as unknown as NonNullable<T>, collectionName));
  }
  return out;
}

function normalizeDoc<T>(doc: AnyDoc | null, collectionName: string): T | null {
  return normalizeDocs<T>([doc], collectionName)[0] ?? null;
}

/** Awaitable single-result query, with mongoose's `.lean()` passthrough. */
class OneQuery<T> {
  #promise: Promise<T | null>;
  constructor(promise: Promise<T | null>) {
    this.#promise = promise;
  }
  /** Docs are already plain objects; kept for mongoose call-site parity. */
  lean(): Promise<T | null> {
    return this.#promise;
  }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T | null) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected);
  }
  catch(onrejected?: ((reason: unknown) => never | PromiseLike<never>) | null) {
    return this.#promise.catch(onrejected);
  }
}

/** Awaitable cursor query with mongoose-style sort()/limit(). */
class FindQuery<T> {
  #collectionName: string;
  #filter: Record<string, unknown>;
  #sort?: Record<string, 1 | -1>;
  #limit?: number;
  constructor(collectionName: string, filter: Record<string, unknown>) {
    this.#collectionName = collectionName;
    this.#filter = filter;
  }
  sort(sort: Record<string, 1 | -1>): this {
    this.#sort = sort;
    return this;
  }
  limit(limit: number): this {
    this.#limit = limit;
    return this;
  }
  async #exec(): Promise<T[]> {
    let cursor = (await getDb()).collection(this.#collectionName).find(castFilter(this.#filter));
    if (this.#sort) cursor = cursor.sort(this.#sort);
    if (this.#limit !== undefined) cursor = cursor.limit(this.#limit);
    return normalizeDocs<T>(await cursor.toArray(), this.#collectionName);
  }
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#exec().then(onfulfilled, onrejected);
  }
  catch(onrejected?: ((reason: unknown) => never | PromiseLike<never>) | null) {
    return this.#exec().catch(onrejected);
  }
}

/** Field defaults applied on create(), mirroring the removed mongoose schemas. */
const DEFAULTS: Record<string, Record<string, unknown | (() => unknown)>> = {
  users: {
    emailVerified: null,
    name: null,
    image: null,
    passwordHash: null,
    createdAt: () => new Date(),
  },
  verification_tokens: { usedAt: null, createdAt: () => new Date() },
  tokens: {
    tokenId: () => newId("tok_"),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: () => new Date(),
  },
  artifacts: {
    artifactId: () => newId("art_"),
    createdAt: () => new Date(),
    updatedAt: () => new Date(),
  },
  share_links: {
    linkId: () => newId("slnk_"),
    createdAt: () => new Date(),
    revokedAt: null,
    expiresAt: null,
    expiredAt: null,
  },
  events: { eventId: () => newId("evt_"), data: null, createdAt: () => new Date() },
  pastes: {
    pasteId: () => newId("paste_"),
    filename: null,
    mimeType: null,
    ciphertext: null,
    burnedAt: null,
    purgedAt: null,
    createdAt: () => new Date(),
  },
};

export class Model<T> {
  #name: string;
  constructor(name: string) {
    this.#name = name;
  }

  async collection() {
    return (await getDb()).collection<Document & Record<string, unknown>>(this.#name);
  }

  findOne(filter: Record<string, unknown>, projection?: Document): OneQuery<T | null> {
    const query = (async () => {
      const col = await this.collection();
      return normalizeDoc<T>(await col.findOne(castFilter(filter), { projection }), this.#name);
    })();
    return new OneQuery<T | null>(query);
  }

  find(filter: Record<string, unknown>): FindQuery<T> {
    return new FindQuery<T>(this.#name, filter);
  }

  async findById(id: string): Promise<T | null> {
    return this.findOne({ _id: id });
  }

  async create(data: Record<string, unknown>): Promise<T> {
    const defaults = DEFAULTS[this.#name] ?? {};
    const doc: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults)) {
      doc[key] = typeof value === "function" ? value() : value;
    }
    Object.assign(doc, data);
    const col = await this.collection();
    const result = await col.insertOne(doc as Document);
    doc._id = result.insertedId;
    return attachSave<T>(doc as unknown as NonNullable<T>, this.#name);
  }

  async updateOne(filter: Record<string, unknown>, update: Document) {
    const col = await this.collection();
    return col.updateOne(castFilter(filter), update);
  }

  async updateMany(filter: Record<string, unknown>, update: Document) {
    const col = await this.collection();
    return col.updateMany(castFilter(filter), update);
  }

  async deleteMany(filter: Record<string, unknown>) {
    const col = await this.collection();
    return col.deleteMany(castFilter(filter));
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Document,
    opts: { new?: boolean } = {},
  ) {
    const col = await this.collection();
    const doc = await col.findOneAndUpdate(castFilter(filter), update, {
      returnDocument: opts.new ? "after" : "before",
    });
    return normalizeDoc<T>(doc, this.#name);
  }

  async aggregate<R>(pipeline: Document[]): Promise<R[]> {
    const col = await this.collection();
    const docs = await col.aggregate(pipeline).toArray();
    return docs as R[];
  }
}

/**
 * Auth.js v5 (MongoDB adapter) owns the core identity fields; passwordHash is
 * null for Google-only users. email is unique and lowercased.
 */
export interface UserDoc {
  _id: ObjectId;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
  createdAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface VerificationTokenDoc {
  _id: ObjectId;
  userId: string;
  tokenHash: string;
  purpose: "verify" | "reset";
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface TokenDoc {
  _id: ObjectId;
  tokenId: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface ArtifactDoc {
  _id: ObjectId;
  artifactId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface ShareLinkDoc {
  _id: ObjectId;
  linkId: string;
  linkToken: string;
  artifactId: string;
  userId: string;
  createdAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
  expiredAt: Date | null;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface EventDoc {
  _id: ObjectId;
  eventId: string;
  userId: string;
  type: string;
  data: Record<string, unknown> | null;
  createdAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export interface PasteDoc {
  _id: ObjectId;
  pasteId: string;
  tokenHash: string;
  kind: "text" | "file";
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number;
  iv: string;
  ciphertext: Buffer | null;
  expiresAt: Date;
  burnedAt: Date | null;
  purgedAt: Date | null;
  createdAt: Date;
  save(): Promise<void>;
  deleteOne(): Promise<void>;
}

export const User = new Model<UserDoc>("users");
export const VerificationToken = new Model<VerificationTokenDoc>("verification_tokens");
export const Token = new Model<TokenDoc>("tokens");
export const Artifact = new Model<ArtifactDoc>("artifacts");
export const ShareLink = new Model<ShareLinkDoc>("share_links");
export const Event = new Model<EventDoc>("events");
export const Paste = new Model<PasteDoc>("pastes");
