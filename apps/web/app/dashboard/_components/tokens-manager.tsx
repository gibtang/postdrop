"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Dialog, DialogContent } from "@/components/dialog";
import { Input } from "@/components/input";
import { relativeDate } from "../utils";
import { CopyButton } from "./copy-button";
import { createTokenAction, revokeTokenAction } from "@/lib/artifact-actions";

export interface TokenRow {
  tokenId: string;
  name: string;
  keyPrefix: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export function TokensManager({ tokens }: { tokens: TokenRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [plaintext, setPlaintext] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CreateTokenForm
          creating={creating}
          setCreating={setCreating}
          onCreated={(token) => {
            setPlaintext(token);
            router.refresh();
          }}
        />
      </Card>

      <Card>
        {tokens.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
            No API tokens yet. Create one so your agent can upload artifacts over MCP or REST.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {tokens.map((token) => (
              <TokenItem key={token.tokenId} token={token} onChanged={() => router.refresh()} />
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={plaintext !== null} onOpenChange={(open) => !open && setPlaintext(null)}>
        <DialogContent
          title="Token created"
          description="Store it now — shown only once. We never persist or re-display the full token."
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                {plaintext}
              </code>
              {plaintext !== null && <CopyButton value={plaintext} />}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setPlaintext(null)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateTokenForm({
  creating,
  setCreating,
  onCreated,
}: {
  creating: boolean;
  setCreating: (busy: boolean) => void;
  onCreated: (plaintext: string) => void;
}) {
  const [name, setName] = React.useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim() === "") {
          toast.error("Token name is required.");
          return;
        }
        setCreating(true);
        const result = await createTokenAction(name);
        setCreating(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setName("");
        onCreated(result.created.token);
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Token name, e.g. “my-agent”"
        className="max-w-xs"
        maxLength={100}
        required
      />
      <Button type="submit" disabled={creating}>
        <Plus className="h-4 w-4" />
        {creating ? "Creating…" : "Create token"}
      </Button>
    </form>
  );
}

function TokenItem({ token, onChanged }: { token: TokenRow; onChanged: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const state = token.revokedAt !== null ? "revoked" : "active";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--text)]">{token.name}</span>
          <Badge tone={state === "revoked" ? "expired" : "answered"}>{state}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          <code className="font-mono">{token.keyPrefix}…</code> · created {relativeDate(token.createdAt)}
          {token.lastUsedAt !== null ? ` · last used ${relativeDate(token.lastUsedAt)}` : " · never used"}
        </p>
      </div>
      {token.revokedAt === null && (
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Revoke
        </Button>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent
          title="Revoke token?"
          description="Requests signed with this token will stop working immediately."
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={revoking}
              onClick={async () => {
                setRevoking(true);
                const result = await revokeTokenAction(token.tokenId);
                setRevoking(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setConfirming(false);
                toast.success("Token revoked.");
                onChanged();
                router.refresh();
              }}
            >
              {revoking ? "Revoking…" : "Revoke token"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

