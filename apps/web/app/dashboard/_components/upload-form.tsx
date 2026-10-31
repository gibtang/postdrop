"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/button";
import {
  completeEditAction,
  completeUploadAction,
  editArtifactAction,
  requestPresignAction,
  uploadArtifactAction,
} from "@/lib/artifact-actions";

/**
 * Files at or below this size go through the server action (multipart);
 * anything larger is PUT directly to storage via a presigned URL.
 */
const INLINE_UPLOAD_LIMIT = 4 * 1024 * 1024;

/**
 * Dual-path artifact upload used by both "New artifact" and "Edit" (replace
 * file). Calls the matching action pair depending on mode and file size.
 */
export function UploadForm({
  artifactId,
  label,
  onDone,
}: {
  /** Present → replace-file mode. */
  artifactId?: string;
  label: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    const replacing = artifactId !== undefined;
    try {
      if (file.size <= INLINE_UPLOAD_LIMIT) {
        setBusy(replacing ? "Replacing…" : "Uploading…");
        const form = new FormData();
        form.set("file", file);
        if (replacing) form.set("artifactId", artifactId);
        const result = replacing
          ? await editArtifactAction(form)
          : await uploadArtifactAction(form);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      } else {
        setBusy("Requesting upload URL…");
        const presign = await requestPresignAction({ filename: file.name, size: file.size });
        if (!presign.ok) {
          toast.error(presign.error);
          return;
        }
        setBusy(replacing ? "Replacing…" : "Uploading…");
        const put = await fetch(presign.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": presign.contentType },
        });
        if (!put.ok) {
          toast.error(`Upload to storage failed (HTTP ${put.status}).`);
          return;
        }
        setBusy("Finishing up…");
        const complete = replacing
          ? await completeEditAction({ artifactId, key: presign.key, filename: presign.filename })
          : await completeUploadAction({ key: presign.key, filename: presign.filename });
        if (!complete.ok) {
          toast.error(complete.error);
          return;
        }
      }
      toast.success(replacing ? "File replaced." : "Artifact uploaded.");
      router.refresh();
      onDone?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
        <Upload className="h-4 w-4" />
        {busy ?? label}
      </Button>
      <p className="text-xs text-[var(--text-muted)]">
        Renderable formats only · {INLINE_UPLOAD_LIMIT / (1024 * 1024)} MB inline, larger files upload directly
      </p>
    </div>
  );
}
