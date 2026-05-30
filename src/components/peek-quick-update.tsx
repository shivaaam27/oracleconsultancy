"use client";

import { useState, useTransition } from "react";
import { Send, Loader2, MessageSquarePlus } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { addTaskUpdate } from "@/app/task/actions";
import { useToast } from "./toast";

/**
 * Minimal "post a quick update" box for the long-press peek. Lets the operator
 * jot a one-line update without opening the full task. Posts through the same
 * server action as the task page, then closes the peek.
 */
export function PeekQuickUpdate({
  row,
  onPosted,
}: {
  row: TaskRow;
  onPosted?: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      await addTaskUpdate(row.id, row.code, text);
      setBody("");
      toast(`${row.code} update posted`, { tone: "success", duration: 4000 });
      onPosted?.();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-muted">
        <MessageSquarePlus size={12} /> Quick update
      </div>
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
          placeholder="Jot a quick update…"
          className="flex-1 min-w-0 rounded-xl border border-border bg-bg-subtle/60 px-3 py-2 text-sm placeholder:text-fg-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || isPending}
          aria-label="Post update"
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
