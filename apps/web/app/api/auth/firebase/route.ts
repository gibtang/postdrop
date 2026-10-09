import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/owner-auth";
import { SESSION_TTL, signSession } from "@/lib/crypto";
import { verifyIdToken } from "@/lib/firebase/admin";
import { Account } from "@/lib/models";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const firebaseLoginSchema = z.object({ idToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  await connectDb();

  const body = firebaseLoginSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(422, "INVALID_INPUT", "idToken required");

  let uid: string;
  let email: string | null;
  try {
    const decoded = await verifyIdToken(body.data.idToken);
    uid = decoded.uid;
    email = decoded.email ?? null;
  } catch {
    return apiError(401, "INVALID_TOKEN", "Firebase ID token verification failed");
  }
  if (!email) return apiError(422, "NO_EMAIL", "Firebase account has no email address");
  email = email.toLowerCase();

  // Upsert Account keyed on firebaseUid; link an existing email-only Account
  // (seeded owner or password-mode user) so both modes share one account.
  let account = await Account.findOne({ firebaseUid: uid });
  if (account) {
    if (account.email !== email) {
      account.email = email;
      await account.save();
    }
  } else {
    const byEmail = await Account.findOne({ email });
    if (byEmail) {
      byEmail.firebaseUid = uid;
      await byEmail.save();
      account = byEmail;
    } else {
      account = await Account.create({ email, firebaseUid: uid, tier: "free" });
    }
  }

  const token = signSession({
    accountId: account.accountId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  });
  const secure = (process.env.BASE_URL || "").startsWith("https://");
  const res = NextResponse.json({ accountId: account.accountId, email: account.email });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    secure,
  });
  return res;
}
