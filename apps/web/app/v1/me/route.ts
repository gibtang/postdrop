import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireToken } from "@/lib/token-auth";
import { apiError, apiJson } from "@/lib/api";

export async function GET(req: NextRequest) {
  await connectDb();
  const token = await requireToken(req);
  if (!token) return apiError(401, "UNAUTHORIZED", "A valid Postdrop API key is required");
  const user = await User.findOne({ _id: token.userId });
  if (!user) return apiError(401, "UNAUTHORIZED", "User for this API key no longer exists");
  return apiJson(200, {
    userId: String(user._id),
    email: user.email,
    name: user.name ?? "",
  });
}
