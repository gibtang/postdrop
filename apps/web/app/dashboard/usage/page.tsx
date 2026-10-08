"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/card";

type Usage = {
  tier: string;
  storageBytes: number;
  capBytes: number;
};

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

export default function UsagePage() {
  const [usage, setUsage] = React.useState<Usage | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok) {
          toast.error(`Could not load usage (${res.status}).`);
          return;
        }
        const body = (await res.json()) as Usage;
        if (!cancelled) setUsage(body);
      } catch {
        toast.error("Network error — please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pct =
    usage && usage.capBytes > 0
      ? Math.min(100, Math.round((usage.storageBytes / usage.capBytes) * 100))
      : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text)]">Usage</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Storage across all your Agents&apos; Drops.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Storage</CardTitle>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--text-muted)]">
              {usage ? usage.tier : "…"} tier
            </span>
          </div>
          <CardDescription>
            Counts every Drop until its content is purged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage === null ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 100 ? "bg-red-500" : "bg-[var(--accent)]"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-medium text-[var(--text)]">
                  {formatBytes(usage.storageBytes)} used
                </span>
                <span className="text-[var(--text-muted)]">
                  {formatBytes(usage.capBytes)} cap · {pct}%
                </span>
              </div>
              {pct >= 100 ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Storage cap reached. Deletes purge space immediately.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
