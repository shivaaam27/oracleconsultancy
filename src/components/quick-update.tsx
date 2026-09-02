"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";

/**
 * Post an update on a task WITHOUT opening the task.
 *
 * Both lists — the administrator's and the portal's — could show you that a
 * task had gone quiet and then made you open the record to say anything about
 * it. This is the one-line answer: a composer that opens inside the row, takes a
 * sentence, and closes. The record page is still there for everything else.
 *
 * It is deliberately dumb about WHERE it posts: the caller passes `post`, so the
 * administrator hands it `addTaskUpdate` and the portal hands it
 * `portalAddUpdate`. Neither side's permission model is duplicated here — both
 * of those actions re-check on the server, which is the only check that counts.
 */
export function QuickUpdate({
  code,
  post,
  onDone,
  onCancel,
}: {
  /** Shown in the placeholder so a stray composer is never anonymous. */
  code: string;
  post: (body: string) => Promise<{ ok: boolean; error?: string } | void>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, start] = useTransition();
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);

  // Opening it should mean you can type — no second click to focus.
  useEffect(() => { ref.current?.focus(); }, []);

  function submit() {
    const text = body.trim();
    if (!text || busy) return;
    start(async () => {
      const res = await post(text);
      if (res && res.ok === false) { toast(res.error ?? "Could not post that update.", { tone: "danger" }); return; }
      setBody("");
      toast(`Update posted on ${code}.`, { tone: "success" });
      onDone();
    });
  }

  return (
    <div
      data-quick-update
      // The row is a link; a click in here must never navigate to the record.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="mt-1 flex items-center gap-1.5"
    >
      <input
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        placeholder={`Add an update on ${code}…`}
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent/50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !body.trim()}
        aria-label="Post update"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <SendHorizontal size={12} />}
        Post
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:text-fg")}
      >
        <X size={13} />
      </button>
    </div>
  );
}
