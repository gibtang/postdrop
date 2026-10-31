import { NextRequest, NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { verifyEmail } from "@/lib/auth-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await connectDb();
  const token = req.nextUrl.searchParams.get("token");
  const ok = token ? await verifyEmail(token) : false;
  return NextResponse.redirect(new URL(`/login?verified=${ok ? 1 : 0}`, req.nextUrl.origin));
}
