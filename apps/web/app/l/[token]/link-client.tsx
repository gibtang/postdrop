"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileText, SearchX, TimerOff } from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent } from "@/components/card";
import { Countdown } from "@/components/countdown";
import { Textarea } from "@/components/input";
import { cn } from "@/components/cn";

type Meta = {
  filename: string;
  sizeBytes: number;
  mimeType?: string;
  expiresAt: string;
  agentName?: string;
};

type Phase =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "expired" }
  | { kind: "ready"; meta: Meta };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = u;
  }
  return `${value.toFixed(value >= 100 || Number.isInteger(value) ? 0 : 1)} ${unit}`;
}

export function LinkClient({ token }: { token: string }) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [reply, setReply] = React.useState("");
  const [replyState, setReplyState] = React.useState<
    "idle" | "sending" | "sent"
  >("idle");
  const [editState, setEditState] = React.useState<
    "idle" | "uploading" | "sent"
  >("idle");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/l/${token}/meta`);
      if (res.status === 404) {
        setPhase({ kind: "notfound" });
        return;
      }
      if (res.status === 410) {
        setPhase({ kind: "expired" });
        return;
      }
      if (!res.ok) {
        toast.error(`Could not load link (${res.status}).`);
        return;
      }
      setPhase({ kind: "ready", meta: await res.json() });
    } catch {
      toast.error("Network error — please try again.");
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submitReply() {
    const text = reply.trim();
    if (text.length === 0) return;
    setReplyState("sending");
    try {
      const res = await fetch(`/l/${token}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 410) {
          setPhase({ kind: "expired" });
          return;
        }
        toast.error(`Reply failed (${res.status}).`);
        return;
      }
      setReplyState("sent");
    } catch {
      toast.error("Network error — please try again.");
      setReplyState("idle");
    }
  }

  async function submitEdit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setEditState("uploading");
    try {
      const res = await fetch(`/l/${token}/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-filename": file.name,
        },
        body: file,
      });
      if (!res.ok) {
        if (res.status === 410) {
          setPhase({ kind: "expired" });
          return;
        }
        toast.error(`Upload failed (${res.status}).`);
        setEditState("idle");
        return;
      }
      setEditState("sent");
    } catch {
      toast.error("Network error — please try again.");
      setEditState("idle");
    }
  }

  if (phase.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-[var(--text-muted)]">Loading link…</p>
      </main>
    );
  }

  if (phase.kind === "notfound") {
    return (
      <StateCard
        icon={<SearchX className="h-8 w-8 text-slate-400" />}
        title="Link not found"
        body="This link doesn't exist or was mistyped. Check the address and try again."
      />
    );
  }

  if (phase.kind === "expired") {
    return (
      <StateCard
        icon={<TimerOff className="h-8 w-8 text-slate-400" />}
        title="This link has expired"
        body="The file and its content are no longer available. Ask the sender for a new link."
      />
    );
  }

  const { meta } = phase;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--surface)]">
              <FileText className="h-7 w-7 text-[var(--accent)]" />
            </span>
            <h1 className="mt-4 text-lg font-semibold break-all text-[var(--text)]">
              {meta.filename}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {formatBytes(meta.sizeBytes)}
              {meta.agentName ? ` · from ${meta.agentName}` : ""}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Expires in <Countdown expiresAt={meta.expiresAt} />
            </p>
            <Button asChild className="mt-6 w-full">
              <a href={`/l/${token}/file`}>Download</a>
            </Button>
          </div>

          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold text-[var(--text)]">Reply</h2>
            {replyState === "sent" ? (
              <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Reply sent. Thank you!
              </p>
            ) : (
              <>
                <Textarea
                  rows={4}
                  maxLength={10_000}
                  className="mt-2"
                  placeholder="Write a reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button
                  className="mt-3 w-full"
                  variant="secondary"
                  disabled={reply.trim().length === 0 || replyState === "sending"}
                  onClick={submitReply}
                >
                  {replyState === "sending" ? "Sending…" : "Send reply"}
                </Button>
              </>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Send an updated file
            </h2>
            {editState === "sent" ? (
              <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                File uploaded. The sender has been updated.
              </p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="mt-2 block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text)]"
                  onChange={() => setEditState("idle")}
                />
                <Button
                  className="mt-3 w-full"
                  variant="secondary"
                  disabled={editState === "uploading" || !fileRef.current?.files?.[0]}
                  onClick={submitEdit}
                >
                  {editState === "uploading" ? "Uploading…" : "Upload file"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function StateCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {icon}
          <h1 className="mt-4 text-lg font-semibold text-[var(--text)]">
            {title}
          </h1>
          <p className={cn("mt-2 max-w-xs text-sm text-[var(--text-muted)]")}>
            {body}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
