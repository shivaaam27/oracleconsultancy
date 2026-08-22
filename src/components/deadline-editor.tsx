"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { inlineUpdateTask } from "@/app/task/actions";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { cn } from "@/lib/cn";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(base: Date | null, days: number): Date {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function endOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
/** "Sat 11 Jul" — the real date a quick-pick lands on (the deadline preview). */
function shortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Inline, interactive deadline chip. Tapping it opens a portalled popover (so it
 * can never be clipped by a row's overflow) with quick-picks that each preview
 * the REAL date they land on, a current-deadline + lateness strip, and a date
 * input — change the deadline without opening the task. Used wherever a deadline
 * is shown (task rows, drawer, etc).
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
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const [pending, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const W = 256;
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
      // Prefer above; flip below when there isn't room up top.
      const above = r.top > 300;
      setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
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
    { label: "Today", date: addDays(null, 0) },
    { label: "Tomorrow", date: addDays(null, 1) },
    { label: "Next week", date: addDays(null, 7) },
    { label: "Month end", date: endOfMonth() },
  ];
  const currentYmd = deadline ? toLocalDate(deadline) : "";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn("inline-flex items-center gap-1.5 text-xs font-medium tabular rounded-md px-1 -mx-1 hover:bg-bg-muted/60 transition-colors", tone, className)}
      >
        <CalendarDays size={12} className="opacity-70" />
        {overdue ? `${Math.abs(daysToDeadline as number)}d late` : label}
        {soon && typeof daysToDeadline === "number" && <span>· {daysToDeadline}d</span>}
        {daysToDeadline === "done" && <Check size={11} />}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: W, transform: pos?.above ? "translateY(-100%)" : undefined, visibility: pos ? "visible" : "hidden" }}
          className="fixed z-[140] glass glass-menu elevated rounded-2xl p-2.5 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Set deadline</span>
            {pending ? <Loader2 size={13} className="animate-spin text-fg-muted" /> : (
              <button type="button" onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg"><X size={14} /></button>
            )}
          </div>

          {deadline ? (
            <div className={cn(
              "mb-2 rounded-xl px-2.5 py-1.5 text-xs ring-1",
              overdue ? "bg-danger-soft/40 text-danger ring-danger/20" : soon ? "bg-warn-soft/40 text-warn ring-warn/25" : "bg-bg-subtle/60 text-fg-muted ring-border/60",
            )}>
              Currently <b>{shortDate(deadline)}</b>
              {typeof daysToDeadline === "number" && (overdue ? ` — ${Math.abs(daysToDeadline)} days late` : daysToDeadline === 0 ? " — due today" : ` — in ${daysToDeadline} days`)}
            </div>
          ) : (
            <div className="mb-2 rounded-xl bg-bg-subtle/60 px-2.5 py-1.5 text-xs text-fg-muted ring-1 ring-border/60">No deadline set</div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {quick.map((q) => {
              const on = toLocalDate(q.date) === currentYmd;
              return (
                <button
                  key={q.label}
                  type="button"
                  disabled={pending}
                  onClick={() => apply(q.date.toISOString(), `${code} due ${shortDate(q.date)}`)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 ring-1 transition-all disabled:opacity-50",
                    on ? "bg-accent-soft ring-accent/30" : "bg-bg-subtle/60 ring-border/60 hover:ring-accent/40",
                  )}
                >
                  <span className={cn("text-xs font-semibold", on ? "text-accent" : "text-fg")}>{q.label}</span>
                  <span className="text-xs text-fg-subtle">{shortDate(q.date)}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-2 flex items-center gap-2 rounded-xl bg-bg-subtle/60 px-2.5 py-1.5 ring-1 ring-border/60">
            <CalendarDays size={13} className="shrink-0 text-fg-subtle" />
            <input
              type="date"
              defaultValue={currentYmd}
              disabled={pending}
              onChange={(e) => { if (e.target.value) apply(e.target.value, `${code} deadline set`); }}
              className="w-full bg-transparent text-xs outline-none"
            />
          </label>

          {deadline && (
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(null, `${code} deadline cleared`)}
              className="mt-1.5 w-full rounded-xl px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-danger-soft/50 hover:text-danger disabled:opacity-50"
            >
              Clear deadline
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
