"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Pencil, Share2, Trash2 } from "lucide-react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Dialog, DialogContent } from "@/components/dialog";
import { Input } from "@/components/input";
import { formatBytes, relativeDate, typeLabel } from "../utils";
import { CopyButton } from "./copy-button";
import { PreviewContent } from "./preview-content";
import { UploadForm } from "./upload-form";
import {
  createShareLinkAction,
  deleteArtifactAction,
  revokeShareLinkAction,
  type ArtifactSummary,
} from "@/lib/artifact-actions";

const EXPIRY_OPTIONS = [
  { label: "Never", days: null },
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export function ArtifactsList({ artifacts }: { artifacts: ArtifactSummary[] }) {
  return (
    <Card>
      {artifacts.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
          No artifacts yet. Upload one above, or let your agent push one with an API token.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {artifacts.map((artifact) => (
            <ArtifactRow key={artifact.artifactId} artifact={artifact} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactSummary }) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = React.useState<null | "preview" | "share" | "edit" | "delete">(null);
  const [deleting, setDeleting] = React.useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge>{typeLabel(artifact.contentType)}</Badge>
          <span className="truncate text-sm font-medium text-[var(--text)]">{artifact.filename}</span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {formatBytes(artifact.size)} · updated {relativeDate(artifact.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => setOpenDialog("preview")}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpenDialog("share")}>
          <Share2 className="h-3.5 w-3.5" /> Share…
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpenDialog("edit")}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpenDialog("delete")}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <Dialog open={openDialog === "preview"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent title={artifact.filename} description={`${typeLabel(artifact.contentType)} · ${formatBytes(artifact.size)}`} className="max-w-2xl">
          <PreviewContent
            contentType={artifact.contentType}
            filename={artifact.filename}
            src={`/api/artifacts/${artifact.artifactId}/content`}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === "edit"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent title="Replace file" description={artifact.filename}>
          <UploadForm
            artifactId={artifact.artifactId}
            label="Choose replacement file"
            onDone={() => setOpenDialog(null)}
          />
        </DialogContent>
      </Dialog>

      <ShareDialog
        artifact={artifact}
        open={openDialog === "share"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        onCreated={() => router.refresh()}
      />

      <Dialog open={openDialog === "delete"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent title="Delete artifact?" description="This removes the file and all of its share links. This cannot be undone.">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                const result = await deleteArtifactAction(artifact.artifactId);
                setDeleting(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setOpenDialog(null);
                toast.success("Artifact deleted.");
                router.refresh();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function ShareDialog({
  artifact,
  open,
  onOpenChange,
  onCreated,
}: {
  artifact: ArtifactSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [expiryDays, setExpiryDays] = React.useState<number | null>(7);
  const [createdUrl, setCreatedUrl] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function create() {
    setCreating(true);
    const result = await createShareLinkAction({ artifactId: artifact.artifactId, expiresInDays: expiryDays });
    setCreating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreatedUrl(result.link.url);
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCreatedUrl(null);
          setExpiryDays(7);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent title="Share artifact" description={artifact.filename}>
        {createdUrl === null ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-[var(--text-muted)]">Link expires</p>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setExpiryDays(option.days)}
                    className={
                      expiryDays === option.days
                        ? "rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--accent)]"
                        : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface)]"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Create link"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Link created. Anyone with this URL can view the artifact — no account needed.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={createdUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={createdUrl} />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
