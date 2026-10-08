import { NextResponse } from "next/server";

/** Uniform error envelope: { error: { code, message? } }. */
export function apiError(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json(
    { error: { code, ...(message ? { message } : {}) } },
    { status },
  );
}

export function attachmentHeaders(filename: string, contentType: string, length?: number): Headers {
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "no-store",
  });
  if (length !== undefined) headers.set("Content-Length", String(length));
  return headers;
}
