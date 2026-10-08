import mongoose from "mongoose";
import { startSweeper } from "./sweeper";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalRef = globalThis as unknown as { __postdropMongoose?: MongooseCache };

const cached: MongooseCache = (globalRef.__postdropMongoose ??= {
  conn: null,
  promise: null,
});

export async function connectDb(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured");
    cached.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  }
  cached.conn = await cached.promise;
  startSweeper();
  return cached.conn;
}
