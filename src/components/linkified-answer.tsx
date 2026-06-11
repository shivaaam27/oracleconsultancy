"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ExternalLink, Check, MessageSquarePlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

// Match task codes like CO01-004 or DAR-007 (possibly inside brackets)
const TASK_CODE_RE = /\[?([A-Z]{2,8}\d{0,3}-\d{2,4})\]?/g;

type Props = {
  text: string;
  onActed?: (taskCode: string, action: string) => void;
  onFocusTask?: (taskCode: string) => void;
};

export function LinkifiedAnswer({ text, onActed, onFocusTask }: Props) {
  // Split text into segments, replacing task codes with chips
  const segments: ({ kind: "text"; value: string } | { kind: "task"; code: string })[] = [];
  let lastIdx = 0;
  let firstCode: string | null = null;
  const seen = new Set<string>();

  for (const m of text.matchAll(TASK_CODE_RE)) {
    if (m.index === undefined) continue;
    if (m.index > lastIdx) segments.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    const code = m[1];
    if (!firstCode) firstCode = code;
    seen.add(code);
    segments.push({ kind: "task", code });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) segments.push({ kind: "text", value: text.slice(lastIdx) });

  // Notify parent of first focused task (once per render)
  // Use a ref or effect to avoid render loops
  const [notifiedCode, setNotifiedCode] = useState<string | null>(null);
  if (firstCode && firstCode !== notifiedCode) {
    setNotifiedCode(firstCode);
    onFocusTask?.(firstCode);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {segments.map((s, i) =>
          s.kind === "text"
            ? <Fragment key={i}>{s.value}</Fragment>
            : <TaskChip key={i} code={s.code} />
        )}
      </p>
      {seen.size > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Array.from(seen).slice(0, 5).map(code => (
            <TaskActionRow key={code} code={code} onActed={onActed} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskChip({ code }: { code: string }) {
  return (
    <Link
      href={`/task/${code}`}
      className="inline-flex items-center gap-0.5 font-mono text-xs bg-accent/10 text-accent hover:bg-accent/20 px-1.5 py-0.5 rounded transition-colors"
    >
      {code}
    </Link>
  );
}

export function TaskActionRow({ code, onActed }: { code: string; onActed?: (code: string, action: string) => void }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateBody, setUpdateBody] = useState("");

  async function act(action: "complete" | "escalate") {
    setRunning(action);
    try {
      const intent = action === "complete"
        ? { type: "complete", taskCode: code }
        : { type: "escalate", taskCode: code };
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: action === "complete" ? `mark ${code} as completed` : `escalate ${code}`, confirm: true }),
      });
      const data = await res.json();
      if (data.executed) {
        setDone(action);
        onActed?.(code, action);
        setTimeout(() => setDone(null), 2500);
      }
    } catch {} finally {
      setRunning(null);
    }
  }

  async function postUpdate() {
    if (!updateBody.trim()) return;
    setRunning("update");
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `add update to ${code}: ${updateBody.trim()}`, confirm: true }),
      });
      const data = await res.json();
      if (data.executed) {
        setDone("update");
        onActed?.(code, "update");
        setUpdateBody("");
        setShowUpdate(false);
        setTimeout(() => setDone(null), 2500);
      }
    } catch {} finally {
      setRunning(null);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1 bg-bg-subtle border border-border rounded-lg p-1.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-fg-muted px-1">{code}</span>
        <button
          onClick={() => router.push(`/task/${code}`)}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-accent transition-colors px-1.5 py-0.5 rounded"
          title="Open task"
        >
          <ExternalLink size={10} /> Open
        </button>
        <button
          onClick={() => act("complete")}
          disabled={!!running}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-success transition-colors px-1.5 py-0.5 rounded disabled:opacity-50"
          title="Mark complete"
        >
          {running === "complete" ? <Loader2 size={10} className="animate-spin" />
            : done === "complete" ? <Check size={10} className="text-success" />
            : <Check size={10} />} Done
        </button>
        <button
          onClick={() => setShowUpdate(s => !s)}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-accent transition-colors px-1.5 py-0.5 rounded"
          title="Add update"
        >
          <MessageSquarePlus size={10} /> Update
        </button>
      </div>
      {showUpdate && (
        <div className="flex items-center gap-1">
          <input
            value={updateBody}
            onChange={e => setUpdateBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") postUpdate(); if (e.key === "Escape") setShowUpdate(false); }}
            placeholder="Type update…"
            autoFocus
            className="flex-1 bg-bg border border-border rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent/50 min-w-[180px]"
          />
          <button
            onClick={postUpdate}
            disabled={!updateBody.trim() || running === "update"}
            className="inline-flex items-center justify-center w-5 h-5 rounded bg-accent text-white disabled:opacity-50"
            title="Post"
          >
            {running === "update" ? <Loader2 size={9} className="animate-spin" /> : done === "update" ? <Check size={9} /> : <Check size={9} />}
          </button>
          <button
            onClick={() => { setShowUpdate(false); setUpdateBody(""); }}
            className="inline-flex items-center justify-center w-5 h-5 rounded text-fg-muted hover:text-danger transition-colors"
            title="Cancel"
          >
            <X size={9} />
          </button>
        </div>
      )}
    </div>
  );
}
