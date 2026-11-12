import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { apiError, isShareLinkLive, shareHeaders } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await connectDb();
  const { token: linkToken } = await params;
  const link = await ShareLink.findOne({ linkToken });
  if (!link || !isShareLinkLive(link)) {
    return apiError(404, "NOT_FOUND", "This link does not exist or is no longer available");
  }
  const artifact = await Artifact.findOne({ artifactId: link.artifactId });
  if (!artifact) {
    return apiError(404, "NOT_FOUND", "This link does not exist or is no longer available");
  }
  const disposition = req.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline";
  const headers = shareHeaders(artifact.contentType, artifact.filename, disposition);

  // iOS Safari requires 206 + Content-Range for <video>; Chrome plays a plain
  // 200. Serve a single byte range; multi-range/open-ended handled by clamping.
  const size = artifact.size;
  const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (rangeMatch && (rangeMatch[1] !== "" || rangeMatch[2] !== "")) {
    let start = rangeMatch[1] === "" ? null : Number.parseInt(rangeMatch[1], 10);
    let end = rangeMatch[2] === "" ? null : Number.parseInt(rangeMatch[2], 10);
    if (start === null) {
      // suffix range: last N bytes
      const suffix = end ?? 0;
      if (suffix === 0) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      end = end === null ? size - 1 : Math.min(end, size - 1);
    }
    if (start >= size || (end ?? 0) < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const body = await getStorage().getRange(artifact.storageKey, start, end ?? size - 1);
    if (body) {
      headers.set("Content-Range", `bytes ${start}-${end ?? size - 1}/${size}`);
      headers.set("Content-Length", String((end ?? size - 1) - start + 1));
      return new Response(body, { status: 206, headers });
    }
  }

  const stream = await getStorage().getStream(artifact.storageKey);
  headers.set("Content-Length", String(size));
  return new Response(stream, { headers });
}
