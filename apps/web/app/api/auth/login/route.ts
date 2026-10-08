import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { SESSION_COOKIE, loginWithPassword } from "@/lib/owner-auth";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  await connectDb();
  const body = loginSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(422, "INVALID_INPUT", "email and password required");

  const result = await loginWithPassword(body.data.email, body.data.password);
  if (!result) return apiError(401, "INVALID_CREDENTIALS");

  const secure = (process.env.BASE_URL || "").startsWith("https://");
  const res = NextResponse.json({
    accountId: result.account.accountId,
    email: result.account.email,
    tier: result.account.tier,
  });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    secure,
  });
  return res;
}
