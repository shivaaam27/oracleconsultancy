"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, X } from "lucide-react";
import { inlineUpdateTask } from "@/app/task/actions";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { cn } from "@/lib/cn";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(base: Date | null, days: number): string {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Inline, interactive deadline chip. Tapping it opens a small popover with quick
 * snooze/postpone options and a date picker — change the deadline without opening
 * the task. Used wherever a task deadline is shown (cards, etc).
 */
export function DeadlineEditor({
  code,
  deadline,
  daysToDeadline,
  className,
}: {
  code: string;
  deadline: Date | null;
  daysToDeadline: number | "done" | null;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const overdue = typeof daysToDeadline === "number" && daysToDeadline < 0;
  const soon = typeof daysToDeadline === "number" && daysToDeadline >= 0 && daysToDeadline <= 7;
  const tone = overdue ? "text-danger" : soon ? "text-warn" : "text-fg-muted";
  const label = deadline ? deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "No date";

  function apply(iso: string | null, msg: string) {
    start(async () => {
      const res = await inlineUpdateTask(code, "deadline", iso);
      if (res.ok) {
        toast(msg, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
        setOpen(false);
        router.refresh();
      } else {
        toast(res.error || "Could not update", { tone: "warn", duration: 3000 });
      }
    });
  }

  const quick = [
    { label: "Today", iso: () => addDays(null, 0) },
    { label: "Tomorrow", iso: () => addDays(null, 1) },
    { label: "+1 week", iso: () => addDays(deadline, 7) },
    { label: "+1 month", iso: () => addDays(deadline, 30) },
  ];

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex items-center gap-1 text-[11px] font-medium tabular rounded-md px-1 -mx-1 hover:bg-bg-muted/60 transition-colors", tone, className)}
      >
        <CalendarDays size={12} className="opacity-70" />
        {label}
        {typeof daysToDeadline === "number" && <span>· {daysToDeadline}d</span>}
        {daysToDeadline === "done" && <span>· ✓</span>}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-[88] cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-[89] bottom-full right-0 mb-1.5 w-52 glass glass-menu elevated rounded-2xl p-2 shadow-lg">
            <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-border/60">
              <span className="text-[10px] uppercase tracking-wider text-fg-muted">Set deadline</span>
              {pending ? <Loader2 size={12} className="animate-spin text-fg-muted" /> : (
                <button type="button" onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg"><X size={13} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={pending}
                  onClick={() => apply(q.iso(), `${code} due ${q.label.toLowerCase()}`)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-bg-subtle/70 ring-1 ring-border/60 hover:ring-accent/40 hover:text-accent transition-all disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              defaultValue={deadline ? toLocalDate(deadline) : ""}
              disabled={pending}
              onChange={(e) => { if (e.target.value) apply(e.target.value, `${code} deadline set`); }}
              className="mt-1.5 w-full px-2 py-1.5 text-xs rounded-lg focus:outline-none"
            />
            {deadline && (
              <button
                type="button"
                disabled={pending}
                onClick={() => apply(null, `${code} deadline cleared`)}
                className="mt-1.5 w-full px-2 py-1.5 text-xs rounded-lg text-fg-muted hover:text-danger hover:bg-danger-soft/50 transition-colors disabled:opacity-50"
              >
                Clear deadline
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
