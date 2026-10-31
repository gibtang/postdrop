"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Dialog, DialogContent } from "@/components/dialog";
import { relativeDate } from "../utils";
import { CopyButton } from "./copy-button";
import { revokeShareLinkAction } from "@/lib/artifact-actions";

export interface LinkRow {
  linkId: string;
  url: string;
  filename: string;
  revokedAt: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function LinksManager({ links }: { links: LinkRow[] }) {
  return (
    <Card>
      {links.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
          No share links yet. Create one from an artifact&apos;s Share… action.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {links.map((link) => (
            <LinkItem key={link.linkId} link={link} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LinkItem({ link }: { link: LinkRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const state = link.revokedAt !== null ? "revoked" : link.expiredAt !== null ? "expired" : "active";

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--text)]">{link.filename}</span>
          <Badge tone={state === "active" ? "answered" : "expired"}>{state}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          created {relativeDate(link.createdAt)}
          {link.expiresAt !== null
            ? ` · expires ${relativeDate(link.expiresAt)}`
            : " · never expires"}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-[var(--text-muted)]">{link.url}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <CopyButton value={link.url} />
        {state === "active" && (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent
          title="Revoke link?"
          description="Anyone opening this URL will see an unavailable page immediately."
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
                const result = await revokeShareLinkAction(link.linkId);
                setRevoking(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setConfirming(false);
                toast.success("Link revoked.");
                router.refresh();
              }}
            >
              {revoking ? "Revoking…" : "Revoke link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
