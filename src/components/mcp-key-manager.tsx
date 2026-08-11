"use client";

// Settings → Security & Access → "Claude access keys".
//
// Mint a key, copy it once, revoke it whenever. The key is shown a single time
// because only its hash is stored — that is the point, not an oversight, so the
// UI says so plainly rather than letting someone assume they can look it up later.

import { useState, useTransition } from "react";
import { Copy, Check, Trash2, KeyRound, Plus, Smartphone } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { McpKeyRow, McpConnectionRow } from "@/app/settings/mcp-actions";

type Props = {
  initial: McpKeyRow[];
  create: (label: string, personId?: number | null) => Promise<{ ok: true; key: string } | { ok: false; error: string }>;
  revoke: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** Assistants that signed in themselves (stage 3) rather than being handed a key. */
  connections?: McpConnectionRow[];
  revokeConnection?: (id: number) => Promise<{ ok: boolean; error?: string }>;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";

export function McpKeyManager({ initial, create, revoke, connections = [], revokeConnection }: Props) {
  const [keys, setKeys] = useState<McpKeyRow[]>(initial);
  const [links, setLinks] = useState<McpConnectionRow[]>(connections);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mint() {
    setError(null);
    start(async () => {
      const r = await create(label.trim() || "Untitled key", null);
      if (!r.ok) { setError(r.error); return; }
      setFresh(r.key);
      setCopied(false);
      setLabel("");
      // The list refreshes on the server revalidate; add optimistically so the
      // new key is visible immediately alongside the one-time secret.
      setKeys((k) => [{ id: -1, label: label.trim() || "Untitled key", personId: null, personName: null, createdAt: new Date().toISOString(), lastUsedAt: null }, ...k]);
    });
  }

  function drop(id: number) {
    start(async () => {
      const r = await revoke(id);
      if (r.ok) setKeys((k) => k.filter((x) => x.id !== id));
      else setError(r.error ?? "Could not revoke that key.");
    });
  }

  function disconnect(id: number) {
    if (!revokeConnection) return;
    start(async () => {
      const r = await revokeConnection(id);
      if (r.ok) setLinks((l) => l.filter((x) => x.id !== id));
      else setError(r.error ?? "Could not disconnect that assistant.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is it for? e.g. “Shivam's laptop”"
          className="flex-1"
        />
        <Button type="button" onClick={mint} disabled={pending}>
          <Plus size={14} /> Create key
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {fresh && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
          <p className="mb-2 text-xs font-medium text-fg">
            Copy this now — it is not shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-bg px-2 py-1.5 text-[11px] font-mono">{fresh}</code>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { void navigator.clipboard.writeText(fresh); setCopied(true); }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-fg-muted">
            Only a fingerprint of the key is saved, so nobody — including this system — can read it
            back. Lose it and you create a new one.
          </p>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-xs text-fg-muted">No keys yet. Anything holding a key can read your COS data, so make one per device and revoke what you stop using.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2.5">
              <KeyRound size={14} className="shrink-0 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">
                  {k.label}
                  {k.personName && <span className="ml-1.5 text-xs text-fg-muted">· {k.personName}</span>}
                </p>
                <p className="text-[11px] text-fg-muted">
                  Created {fmt(k.createdAt)} · last used {fmt(k.lastUsedAt)}
                </p>
              </div>
              {k.id > 0 && (
                <Button type="button" variant="ghost" onClick={() => drop(k.id)} disabled={pending} aria-label={`Revoke ${k.label}`}>
                  <Trash2 size={14} className="text-danger" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Connections are the other way in: nobody was handed a key, somebody
          pressed Approve on the sign-in screen. Same list, same one-click cut-off. */}
      {revokeConnection && (
        <div className="border-t border-border/50 pt-3">
          <p className="mb-1.5 text-xs font-medium text-fg">Connected assistants</p>
          {links.length === 0 ? (
            <p className="text-xs text-fg-muted">
              None yet. When you add COS as a connector in Claude on your phone or on claude.ai, it
              appears here — and disconnecting it takes effect straight away.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {links.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <Smartphone size={14} className="shrink-0 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">
                      {c.label}
                      <span className="ml-1.5 text-xs text-fg-muted">· {c.personName ?? "you"}</span>
                    </p>
                    <p className="text-[11px] text-fg-muted">
                      Connected {fmt(c.createdAt)} · last used {fmt(c.lastUsedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => disconnect(c.id)}
                    disabled={pending}
                    aria-label={`Disconnect ${c.label}`}
                  >
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
