import { MongoClient } from "mongodb";

/**
 * Raw `mongodb` driver connection (replaces mongoose for Cloudflare Workers
 * compatibility). One client per isolate, cached on globalThis like the old
 * mongoose cache so hot reloads and repeated invocations reuse it.
 */
const globalRef = globalThis as unknown as { __postdropMongo?: MongoClient };

export async function connectDb(): Promise<MongoClient> {
  if (globalRef.__postdropMongo) return globalRef.__postdropMongo;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  globalRef.__postdropMongo = client;
  return client;
}

/** Returns the app database, ensuring the client is connected first. */
export async function getDb() {
  const client = await connectDb();
  return client.db(process.env.MONGODB_DATABASE_NAME || "postdrop");
}
