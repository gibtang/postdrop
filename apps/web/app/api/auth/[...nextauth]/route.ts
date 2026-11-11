import { handlers } from "@/auth";
import { withApiErrors } from "@/lib/api-errors";
import type { NextRequest } from "next/server";

// Next 15 types catch-all params as { nextauth: string[] }; next-auth's beta
// handler type still declares Record<string, string>, so adapt the handler
// shape here (ctx is passed through unchanged at runtime).
type CatchAllCtx = { params: Promise<{ nextauth: string[] }> };
type CatchAllHandler = (req: NextRequest, ctx: CatchAllCtx) => Promise<Response>;
const auth = handlers as unknown as { GET: CatchAllHandler; POST: CatchAllHandler };

export const GET = withApiErrors("api/auth", auth.GET);
export const POST = withApiErrors("api/auth", auth.POST);

export const runtime = "nodejs";
