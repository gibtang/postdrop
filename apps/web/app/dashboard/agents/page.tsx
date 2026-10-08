"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import { Input } from "@/components/input";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/dialog";

type Agent = {
  agentId: string;
  name: string;
  keyPrefix: string;
  revokedAt?: string | null;
  createdAt: string;
};

export default function AgentsPage() {
  const [agents, setAgents] = React.useState<Agent[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [plaintextKey, setPlaintextKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) {
        toast.error(`Could not load agents (${res.status}).`);
        return;
      }
      const body = (await res.json()) as { agents?: Agent[] };
      setAgents(body.agents ?? []);
    } catch {
      toast.error("Network error — please try again.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function closeDialog() {
    setDialogOpen(false);
    setName("");
    setPlaintextKey(null);
    setCopied(false);
  }

  async function createAgent() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        toast.error(`Could not create agent (${res.status}).`);
        return;
      }
      const body = (await res.json()) as { apiKey?: string; key?: string };
      const key = body.apiKey ?? body.key;
      if (!key) {
        toast.error("Agent created but key missing from response.");
        await load();
        closeDialog();
        return;
      }
      setPlaintextKey(key);
      await load();
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(agentId: string) {
    if (!window.confirm(`Revoke agent ${agentId}? Its key stops working immediately.`)) {
      return;
    }
    setDeleting(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(`Revoke failed (${res.status}).`);
        return;
      }
      setAgents(
        (prev) =>
          prev?.map((a) =>
            a.agentId === agentId
              ? { ...a, revokedAt: new Date().toISOString() }
              : a,
          ) ?? null,
      );
      toast.success("Agent revoked");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setDeleting(null);
    }
  }

  async function copyKey() {
    if (!plaintextKey) return;
    try {
      await navigator.clipboard.writeText(plaintextKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Agents</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Keys your Agents use to send Drops.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New agent
            </Button>
          </DialogTrigger>
          <DialogContent
            title={plaintextKey ? "Agent key created" : "New agent"}
            description={
              plaintextKey
                ? undefined
                : "Give this Agent a name so you can recognize it later."
            }
          >
            {plaintextKey ? (
              <div className="space-y-4">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  This is the only time the full key is shown. Copy it now —
                  it cannot be recovered.
                </p>
                <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text)]">
                  {plaintextKey}
                </code>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={copyKey}>
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                  <DialogClose asChild>
                    <Button variant="secondary" className="flex-1">
                      Done
                    </Button>
                  </DialogClose>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createAgent();
                }}
                className="space-y-4"
              >
                <Input
                  required
                  autoFocus
                  placeholder="e.g. coding-agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Creating…" : "Create agent"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Key prefix</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  Loading…
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  No Agents yet. Create one to get a key.
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr
                  key={agent.agentId}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--text)]">
                    {agent.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                    {agent.keyPrefix}…
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {agent.revokedAt ? (
                      <Badge tone="expired">revoked</Badge>
                    ) : (
                      <Badge tone="answered">active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {agent.revokedAt ? null : (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deleting === agent.agentId}
                        onClick={() => revoke(agent.agentId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Revoke
                      </Button>
                    )}
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
