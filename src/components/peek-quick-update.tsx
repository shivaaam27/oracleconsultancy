"use client";

import { useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { addTaskUpdate } from "@/app/task/actions";
import { IconButton } from "./ui";
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
    <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
          placeholder="Jot a quick update…"
          className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm bg-bg-subtle ring-1 ring-border/50 placeholder:text-fg-muted resize-none focus:outline-none focus:ring-accent/40 transition-shadow"
        />
        <IconButton
          type="button"
          variant="primary"
          size="lg"
          onClick={submit}
          disabled={!body.trim() || isPending}
          aria-label="Post update"
          title="Post update (⌘↵)"
        >
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </IconButton>
    </div>
  );
}
