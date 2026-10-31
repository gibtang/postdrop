import { connectDb } from "@/lib/db";
import { Artifact, type ArtifactDoc } from "@/lib/models";
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
  const artifacts = docs.map(serializeForDashboard);

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
