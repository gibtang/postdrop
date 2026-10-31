"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Download, EyeOff, Flame, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";
import { decryptBytes, fromB64Url } from "@/lib/webcrypto";

type Phase =
  | { state: "loading" }
  | { state: "noKey" }
  | { state: "ready-text"; text: string; sizeBytes: number }
  | { state: "ready-file"; blobUrl: string; filename: string; sizeBytes: number }
  | { state: "viewed" }
  | { state: "expired" }
  | { state: "missing" }
  | { state: "decryptFailed" }
  | { state: "networkFailed" };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ViewClient({ token }: { token: string }) {
  const [phase, setPhase] = React.useState<Phase>({ state: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const keyB64Url = window.location.hash.slice(1);
      if (!keyB64Url) {
        setPhase({ state: "noKey" });
        return;
      }
      try {
        const res = await fetch(`/api/pastes/${token}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setPhase({ state: "missing" });
          return;
        }
        if (res.status === 410) {
          const { reason } = (await res.json()) as { reason: "viewed" | "expired" };
          setPhase({ state: reason === "expired" ? "expired" : "viewed" });
          return;
        }
        if (!res.ok) {
          setPhase({ state: "networkFailed" });
          return;
        }
        const payload = (await res.json()) as {
          kind: "text" | "file";
          filename: string | null;
          mimeType: string | null;
          sizeBytes: number;
          iv: string;
          ciphertext: string;
        };
        let plaintext: Uint8Array;
        try {
          plaintext = await decryptBytes(keyB64Url, payload.iv, payload.ciphertext);
        } catch {
          setPhase({ state: "decryptFailed" });
          return;
        }
        if (cancelled) return;

        if (payload.kind === "text") {
          setPhase({
            state: "ready-text",
            text: new TextDecoder().decode(plaintext),
            sizeBytes: plaintext.length,
          });
          return;
        }
        const mime = payload.mimeType || "application/octet-stream";
        const blob = new Blob([plaintext as BlobPart], { type: mime });
        setPhase({
          state: "ready-file",
          blobUrl: URL.createObjectURL(blob),
          filename: payload.filename ?? "file",
          sizeBytes: plaintext.length,
        });
      } catch {
        if (!cancelled) setPhase({ state: "networkFailed" });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-[var(--surface)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold tracking-tight text-white">
            pd
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
              One-time secret
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Decrypted in your browser — the key never left this page.
            </p>
          </div>
        </div>

        <Card className="mt-6">
          {phase.state === "loading" && (
            <CardContent className="flex items-center gap-3 py-10 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching and burning…
            </CardContent>
          )}

          {phase.state === "noKey" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              This link is incomplete — the decryption key is the part after{" "}
              <code>#</code> and was lost. Ask the sender for the full link.
            </CardContent>
          )}

          {phase.state === "ready-text" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-emerald-600" />
                  Your secret
                </CardTitle>
                <CardDescription>
                  This secret is now destroyed. Refreshing will not bring it
                  back — copy what you need.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-[#17172d] px-4 py-3.5 font-mono text-sm leading-6 text-[#e6e5f2]">
                  {phase.text}
                </pre>
                <CopyTextButton text={phase.text} />
              </CardContent>
            </>
          )}

          {phase.state === "ready-file" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-emerald-600" />
                  Your secret file
                </CardTitle>
                <CardDescription>
                  This secret is now destroyed. Download before you leave —
                  refreshing will not bring it back.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-[var(--text)]">
                  {phase.filename} · {formatBytes(phase.sizeBytes)}
                </p>
                <Button asChild>
                  <a href={phase.blobUrl} download={phase.filename}>
                    <Download className="h-4 w-4" />
                    Download file
                  </a>
                </Button>
              </CardContent>
            </>
          )}

          {phase.state === "viewed" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              <p className="flex items-center gap-2 font-medium text-[var(--text)]">
                <EyeOff className="h-4 w-4" />
                Already viewed
              </p>
              <p className="mt-2">
                One-time secrets die after a single view. Ask the sender for a
                fresh link.
              </p>
            </CardContent>
          )}

          {phase.state === "expired" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              <p className="flex items-center gap-2 font-medium text-[var(--text)]">
                <Flame className="h-4 w-4" />
                Expired
              </p>
              <p className="mt-2">
                This secret expired before it was opened. Ask the sender for a
                fresh link.
              </p>
            </CardContent>
          )}

          {phase.state === "missing" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)]">No secret here.</p>
              <p className="mt-2">
                Check the link — it may have been mistyped or already consumed.
              </p>
            </CardContent>
          )}

          {phase.state === "decryptFailed" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)]">Could not decrypt.</p>
              <p className="mt-2">
                The key in this link does not match the secret. The link is
                likely truncated — use the full URL the sender shared.
              </p>
            </CardContent>
          )}

          {phase.state === "networkFailed" && (
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)]">Connection problem.</p>
              <p className="mt-2">
                Careful: a one-time secret may have been consumed if the request
                reached the server. Reload once only if you are sure it did not.
              </p>
            </CardContent>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Powered by{" "}
          <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
            Postdrop
          </Link>{" "}
          — expiring file handoffs between AI agents and humans.
        </p>
      </div>
    </main>
  );
}

function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Selection copy is available as a fallback; keep quiet.
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={() => void copy()}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy to clipboard"}
    </Button>
  );
}
