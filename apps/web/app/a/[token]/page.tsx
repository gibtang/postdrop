import { notFound } from "next/navigation";
import { connectDb } from "@/lib/db";
import { Artifact, ShareLink } from "@/lib/models";
import { formatBytes, typeLabel } from "@/app/dashboard/utils";
import { PreviewContent } from "@/app/dashboard/_components/preview-content";

export const metadata = { title: "Shared artifact — Postdrop" };

export default async function ViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connectDb();
  const link = await ShareLink.findOne({ linkToken: token });
  const live =
    link !== null &&
    link.revokedAt === null &&
    link.expiredAt === null &&
    (link.expiresAt === null || link.expiresAt === undefined || link.expiresAt.getTime() >= Date.now());

  const artifact = live ? await Artifact.findOne({ artifactId: link.artifactId }) : null;

  // Dead links (expired, revoked, or deleted artifact) must respond 404
  // without distinguishing why — see tests/acceptance.test.ts share lifecycle.
  if (!live || artifact === null) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Shared with Postdrop</p>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-[var(--text)]">{artifact.filename}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {typeLabel(artifact.contentType)} · {formatBytes(artifact.size)} · view-only
        </p>
      </header>
      <PreviewContent
        contentType={artifact.contentType}
        filename={artifact.filename}
        src={`/a/${token}/raw`}
      />
    </main>
  );
}
