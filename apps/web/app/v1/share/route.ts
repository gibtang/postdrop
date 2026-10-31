import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { ShareLink } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson, serializeShareLink } from "@/lib/api";

export async function GET(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const links = await ShareLink.find({ userId: token.userId }).sort({ createdAt: -1 });
  return apiJson(200, { items: links.map(serializeShareLink) });
}
