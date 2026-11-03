import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { notifyErrorAfter } from "@/lib/error-notify";

type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<Response> | Response;

/**
 * Shared error-catching wrapper for API route handlers: any unhandled throw
 * is reported (Sentry + Telegram) and returned as the uniform 500 envelope
 * instead of an opaque framework error page.
 */
export function withApiErrors<P extends Record<string, string> = Record<string, string>>(
  source: string,
  handler: RouteHandler<P>,
): (req: NextRequest, ctx: RouteContext) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx as { params: Promise<P> });
    } catch (err) {
      notifyErrorAfter({
        error: err,
        source,
        status: 500,
        details: {
          path: new URL(req.url).pathname,
          method: req.method,
        },
      });
      return apiError(500, "INTERNAL_ERROR");
    }
  };
}
