"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import { Countdown } from "@/components/countdown";

type Drop = {
  dropId: string;
  filename: string;
  agentName?: string;
  agentId?: string;
  recipientEmail: string;
  status: "pending" | "answered" | "expired";
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
  hasReply?: boolean;
  hasEdit?: boolean;
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

export default function DropsPage() {
  const [drops, setDrops] = React.useState<Drop[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/drops");
      if (!res.ok) {
        toast.error(`Could not load drops (${res.status}).`);
        return;
      }
      const body = (await res.json()) as { drops?: Drop[] };
      setDrops(body.drops ?? []);
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function remove(dropId: string) {
    if (
      !window.confirm(
        "Delete this Drop? The file and any Reply/Edit are purged immediately.",
      )
    ) {
      return;
    }
    setDeleting(dropId);
    try {
      const res = await fetch(`/api/drops/${dropId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(`Delete failed (${res.status}).`);
        return;
      }
      setDrops((prev) => prev?.filter((d) => d.dropId !== dropId) ?? null);
      toast.success("Drop deleted and purged");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Drops</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Files your Agents sent to Recipients.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-3 font-medium">Filename</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drops === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  Loading…
                </td>
              </tr>
            ) : drops.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  No Drops yet. Create an Agent key and send your first file.
                </td>
              </tr>
            ) : (
              drops.map((drop) => (
                <tr
                  key={drop.dropId}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                >
                  <td className="max-w-48 truncate px-4 py-3 font-medium text-[var(--text)]">
                    {drop.filename}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {drop.agentName ?? drop.agentId ?? "—"}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-[var(--text-muted)]">
                    {drop.recipientEmail}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={drop.status}>{drop.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    <Countdown expiresAt={drop.expiresAt} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {formatBytes(drop.sizeBytes)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={`/api/drops/${drop.dropId}/file`}
                          title="Download original"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deleting === drop.dropId}
                        onClick={() => remove(drop.dropId)}
                        title="Delete and purge now"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
