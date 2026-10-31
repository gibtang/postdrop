"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, FileUp, Flame, Link2, Loader2, Lock, Type } from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";
import { Textarea } from "@/components/input";
import { cn } from "@/components/cn";
import { encryptBytes, newKeyB64Url, randomIv, toB64 } from "@/lib/webcrypto";

// Mirror of MAX_FILE_BYTES in lib/pastes.ts (kept inline: that module pulls
// server-only mongoose code).
const MAX_FILE_BYTES = 5_000_000;

const TTL_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

type Mode = "text" | "file";

type CreateResult = {
  url: string;
  expiresAt: string;
};

export function PasteClient() {
  const [mode, setMode] = React.useState<Mode>("text");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [ttlHours, setTtlHours] = React.useState<number>(24);
  const [creating, setCreating] = React.useState(false);
  const [result, setResult] = React.useState<CreateResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function create() {
    if (creating) return;
    setCreating(true);
    setResult(null);
    try {
      const keyB64Url = await newKeyB64Url();
      const iv = randomIv();

      let plaintext: Uint8Array;
      let filename: string | null = null;
      let mimeType: string | null = null;
      let sizeBytes: number;
      if (mode === "text") {
        plaintext = new TextEncoder().encode(text);
        sizeBytes = plaintext.length;
      } else {
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
          toast.error("File is larger than 5 MB — use Postdrop for bigger handoffs.");
          return;
        }
        plaintext = new Uint8Array(await file.arrayBuffer());
        filename = file.name;
        mimeType = file.type || "application/octet-stream";
        sizeBytes = file.size;
      }
      if (plaintext.length === 0) {
        toast.error("Nothing to share yet.");
        return;
      }

      const ciphertext = await encryptBytes(keyB64Url, iv, plaintext);

      const res = await fetch("/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: mode,
          iv: toB64(iv),
          ciphertext: toB64(ciphertext),
          ttlHours,
          filename,
          mimeType,
          sizeBytes,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        toast.error(payload?.error?.message ?? `Could not create the secret link (${res.status}).`);
        return;
      }
      const { token, expiresAt } = (await res.json()) as { token: string; expiresAt: string };
      setResult({ url: `${window.location.origin}/s/${token}#${keyB64Url}`, expiresAt });
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function copyUrl() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the link and copy manually.");
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold tracking-tight text-white">
            pd
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
              One-time secret link
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Encrypted in your browser. The key lives in the link itself — the
              server never sees it, and the secret dies after one view.
            </p>
          </div>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-[var(--accent)]" />
              Create a secret
            </CardTitle>
            <CardDescription>
              Text or a file up to 5 MB. No account, no tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={mode === "text"}
                onClick={() => setMode("text")}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  mode === "text"
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                <Type className="h-4 w-4" />
                Text
              </button>
              <button
                type="button"
                aria-pressed={mode === "file"}
                onClick={() => setMode("file")}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  mode === "file"
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                <FileUp className="h-4 w-4" />
                File
              </button>
            </div>

            {mode === "text" ? (
              <Textarea
                rows={7}
                placeholder="Paste a password, key, or note…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  File <span className="font-normal text-[var(--text-muted)]">(up to 5 MB)</span>
                </span>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text)]"
                />
              </label>
            )}

            <label className="block max-w-56">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                Expires after
              </span>
              <select
                value={ttlHours}
                onChange={(e) => setTtlHours(Number(e.target.value))}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              >
                {TTL_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <Button onClick={() => void create()} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {creating ? "Encrypting…" : "Create one-time link"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="mt-4 border-amber-300 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-amber-600" />
                Your one-time link
              </CardTitle>
              <CardDescription className="text-amber-800">
                Shown once. Anyone with this link can read the secret exactly
                once — then it is gone. Save it now.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 font-mono text-xs text-[var(--text)]"
                />
                <Button variant="secondary" onClick={() => void copyUrl()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-amber-700">
                Expires {new Date(result.expiresAt).toLocaleString()} — even unread.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Need agents to hand files to people and get answers back?{" "}
          <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
            Postdrop does that
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
