import { connectDb } from "@/lib/db";
import { Artifact, ShareLink, type ArtifactDoc } from "@/lib/models";
import { baseUrl, isShareLinkLive } from "@/lib/api";
import { requireUser } from "@/lib/auth-user";
import { serializeForDashboard } from "@/lib/dashboard-serialize";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/card";
import { ArtifactsList } from "./_components/artifacts-list";
import { UploadForm } from "./_components/upload-form";

export const metadata = { title: "Artifacts — Postdrop" };

export default async function DashboardPage() {
  const user = await requireUser();
  await connectDb();
  const docs: ArtifactDoc[] = user
    ? await Artifact.find({ userId: String(user._id) }).sort({ createdAt: -1 }).limit(100)
    : [];
  // Newest live share link per artifact so rows can show the link itself.
  const ids = docs.map((d) => d.artifactId);
  const links =
    ids.length > 0
      ? await ShareLink.find({ artifactId: { $in: ids } }).sort({ createdAt: -1 }).limit(500)
      : [];
  const liveShare = new Map<string, string>();
  for (const link of links) {
    if (liveShare.has(link.artifactId)) continue;
    if (isShareLinkLive(link)) liveShare.set(link.artifactId, `${baseUrl()}/a/${link.linkToken}`);
  }
  const artifacts = docs.map((d) => ({
    ...serializeForDashboard(d),
    liveShareUrl: liveShare.get(d.artifactId) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">Artifacts</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Files your agent or you have uploaded. Preview them, share browser-renderable links, or replace the file.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload an artifact</CardTitle>
          <CardDescription>Upload a file directly, or hand your agent a token from the Tokens page.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm label="Choose a file" />
        </CardContent>
      </Card>

      <ArtifactsList artifacts={artifacts} />
    </div>
  );
}
