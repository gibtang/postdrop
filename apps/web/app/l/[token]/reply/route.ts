import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { resolveLinkDrop } from "@/lib/link-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replySchema = z.object({ text: z.string().min(1).max(10_000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await connectDb();
  const { token } = await params;
  const resolved = await resolveLinkDrop(token);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: { code: resolved.status === 410 ? "EXPIRED" : "NOT_FOUND" } },
      { status: resolved.status },
    );
  }
  const parsed = replySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "text (1-10000 chars) required" } },
      { status: 422 },
    );
  }
  const { drop } = resolved;
  drop.replyText = parsed.data.text;
  drop.status = "answered";
  drop.answeredAt = new Date();
  await drop.save();
  return NextResponse.json({ status: "answered" });
}
