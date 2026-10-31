import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
import { Artifact } from "@/lib/models";
import { shareHeaders } from "@/lib/api";
import { getStorage } from "@/lib/storage/index";

/**
 * Session-authed content route for dashboard previews. No bearer token
 * involved: the browser's session cookie is the credential, owner access is
 * enforced here, and bytes are served with the same sandbox headers as the
 * public share route.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ artifactId: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  await connectDb();
  const { artifactId } = await params;
  const artifact = await Artifact.findOne({ artifactId, userId });
  if (!artifact) {
    return new Response("Not found", { status: 404 });
  }
  const stream = await getStorage().getStream(artifact.storageKey);
  return new Response(stream, { headers: shareHeaders(artifact.contentType, artifact.filename) });
}
