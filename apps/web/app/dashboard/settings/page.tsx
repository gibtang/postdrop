import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-user";
import { linkGoogleAction } from "../../(auth)/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";
import { Button } from "@/components/button";

export const metadata = { title: "Settings — Postdrop" };

interface SettingsProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsProps) {
  const user = await requireUser();
  const params = await searchParams;
  const db = await connectDb();
  const googleAccount = user
    ? await db.connection.db!.collection("accounts").findOne(
        { userId: user._id, provider: "google" },
        { projection: { _id: 1 } },
      )
    : null;
  const googleLinked = Boolean(googleAccount);
  const notice = params.google === "linked"
    ? "Google is now linked to your Postdrop account."
    : params.google === "already-linked"
      ? "A Google account is already linked to this Postdrop account."
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Manage how you sign in to Postdrop.</p>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google sign-in</CardTitle>
          <CardDescription>
            {googleLinked
              ? "A Google account is linked to this Postdrop account."
              : "Sign in to Google while signed in to Postdrop to link the accounts securely."}
          </CardDescription>
        </CardHeader>
        {!googleLinked && (
          <CardContent>
            <form action={linkGoogleAction}>
              <Button type="submit" variant="secondary">Link Google account</Button>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
