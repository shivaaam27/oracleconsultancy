"use client";

import { useState, useTransition, useRef } from "react";
import { Send, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { addTaskUpdate } from "@/app/task/actions";

const STATUSES = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];

type Props = { taskId: number; taskCode: string; currentStatus: string };

export function UpdateBox({ taskId, taskCode, currentStatus }: Props) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    if (!body.trim()) return;
    startTransition(async () => {
      await addTaskUpdate(taskId, taskCode, body, status || undefined);
      setBody("");
      setStatus("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-accent" />
        <span className="text-sm font-medium">Post Update</span>
      </div>

      <textarea
        ref={ref}
        rows={2}
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(); }}
        placeholder="What happened? e.g. Called supplier, confirmed delivery by Friday…"
        className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-sm placeholder:text-fg-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 text-fg-muted"
        >
          <option value="">Keep status ({currentStatus})</option>
          {STATUSES.filter(s => s !== currentStatus).map(s => (
            <option key={s} value={s}>Change to: {s}</option>
          ))}
        </select>

        <button
          onClick={handleSubmit}
          disabled={!body.trim() || isPending}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : success ? <CheckCircle2 size={13} /> : <Send size={13} />}
          {isPending ? "Posting…" : success ? "Posted!" : "Post Update"}
        </button>
      </div>
    </div>
  );
}
