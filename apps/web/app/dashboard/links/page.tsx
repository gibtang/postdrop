import Link from "next/link";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { requireUser } from "@/lib/auth-user";
import { serializeShareLink } from "@/lib/api";
import { LinksManager, type LinkRow } from "../_components/links-manager";

export const metadata = { title: "Links — Postdrop" };

export default async function LinksPage() {
  const user = await requireUser();
  await connectDb();
  const links: LinkRow[] = [];
  if (user) {
    const docs = await ShareLink.find({ userId: String(user._id) }).sort({ createdAt: -1 });
    const artifacts = await Artifact.find({
      artifactId: { $in: [...new Set(docs.map((doc) => doc.artifactId))] },
    });
    const filenames = new Map(artifacts.map((a) => [a.artifactId, a.filename]));
    for (const doc of docs) {
      links.push({
        ...serializeShareLink(doc),
        filename: filenames.get(doc.artifactId) ?? "unknown file",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">Share links</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Public viewer links. Active links open a read-only, browser-rendered view.
        </p>
      </div>
      <LinksManager links={links} />
      <p className="text-xs text-[var(--text-muted)]">
        Need a new link? Head to <Link href="/dashboard" className="underline">Artifacts</Link> and use Share….
      </p>
    </div>
  );
}
