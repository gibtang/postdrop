import { connectDb } from "@/lib/db";
import { Token } from "@/lib/models";
import { requireUser } from "@/lib/auth-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";
import { TokensManager, type TokenRow } from "../_components/tokens-manager";

export const metadata = { title: "Tokens — Postdrop" };

export default async function TokensPage() {
  const user = await requireUser();
  await connectDb();
  const docs = user ? await Token.find({ userId: String(user._id) }).sort({ createdAt: -1 }) : [];
  const tokens: TokenRow[] = docs.map((doc) => ({
    tokenId: doc.tokenId,
    name: doc.name,
    keyPrefix: doc.keyPrefix,
    revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null,
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">API tokens</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Bearer keys for the CLI, MCP server, and /v1 REST API. Tokens are shown once at creation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a token</CardTitle>
          <CardDescription>Send it as Authorization: Bearer &lt;token&gt; on /v1 endpoints.</CardDescription>
        </CardHeader>
        <CardContent>
          <TokensManager tokens={tokens} />
        </CardContent>
      </Card>
    </div>
  );
}
