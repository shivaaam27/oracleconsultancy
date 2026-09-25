"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { inlineUpdateTask } from "@/app/task/actions";
import { useToast } from "../shell/toast";
import { callUndo } from "../shell/undo-banner";
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
  studio = false,
}: {
  /** Studio list: plain coloured words ("2d late", "Sat 26 Sept"), no icon.
   *  "dark" = the record's band chip ("22 Sept · 2 days late"). */
  studio?: boolean | "dark" | "date";
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

  const W = 280;
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
      const res = await inlineUpdateTask(code, "deadline", iso).catch(() => ({ ok: false as const, error: "That didn't go through — check the connection and try again.", undoToken: undefined }));
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
      {studio === "dark" ? (
        <button
          ref={btnRef}
          type="button"
          title="Change the deadline"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={cn(
            "inline-flex h-7 items-center whitespace-nowrap rounded-lg bg-[#1F2023] px-2.5 text-xs transition-colors hover:bg-[#2A2C30]",
            overdue ? "text-[#F07BBE]" : soon ? "text-[#F5B94E]" : deadline ? "text-[#F2F2F0]" : "text-[#D4D6DA]",
            className,
          )}
        >
          {deadline
            ? `${deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${overdue ? ` · ${Math.abs(daysToDeadline as number)} ${Math.abs(daysToDeadline as number) === 1 ? "day" : "days"} late` : daysToDeadline === 0 ? " · today" : ""}`
            : "No deadline"}
        </button>
      ) : studio ? (
        <button
          ref={btnRef}
          type="button"
          title="Change the deadline"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={cn(
            "-mx-1 whitespace-nowrap rounded-md px-1 text-[13px] transition-colors hover:bg-[var(--st-page)]",
            overdue ? "font-semibold text-[var(--st-late-text)]" : soon ? "text-[var(--st-soon-text)]" : deadline ? "text-[var(--st-ink)]" : "text-[var(--st-muted)]",
            className,
          )}
        >
          {studio === "date" && deadline
            ? deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : overdue
            ? `${Math.abs(daysToDeadline as number)}d late`
            : daysToDeadline === 0
              ? "Today"
              : deadline
                ? deadline.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")
                : "No date"}
        </button>
      ) : (
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
      )}

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          data-st-menu
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: W, transform: pos?.above ? "translateY(-100%)" : undefined, visibility: pos ? "visible" : "hidden" }}
          className="studio st-pop fixed z-[140] rounded-[18px] border border-[var(--st-line)] bg-[var(--st-surface)] p-3.5 text-[var(--st-ink)] shadow-[0_16px_40px_rgba(17,18,20,0.16)] max-sm:p-4"
        >
          {/* The Studio look (owner, 25 Sept 2026: "seems old design"); on a
              phone it is a full-width panel at the foot (data-st-menu) with
              thumb-sized buttons. */}
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[15px] font-semibold">Deadline</span>
            {pending ? <Loader2 size={15} className="animate-spin text-[var(--st-muted)]" /> : (
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)] max-sm:h-10 max-sm:w-10"><X size={15} /></button>
            )}
          </div>

          <div className={cn(
            "mb-2.5 rounded-xl px-3 py-2 text-[13px]",
            overdue ? "bg-[var(--st-bad-wash)] text-[var(--st-late-text)]" : soon ? "bg-[var(--st-warn-wash)] text-[var(--st-soon-text)]" : "bg-[var(--st-page)] text-[var(--st-sub)]",
          )}>
            {deadline ? (
              <>
                Now <b className="font-semibold">{shortDate(deadline)}</b>
                {typeof daysToDeadline === "number" && (overdue ? ` · ${Math.abs(daysToDeadline)} days late` : daysToDeadline === 0 ? " · due today" : ` · in ${daysToDeadline} days`)}
              </>
            ) : "No deadline set"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {quick.map((q) => {
              const on = toLocalDate(q.date) === currentYmd;
              return (
                <button
                  key={q.label}
                  type="button"
                  disabled={pending}
                  onClick={() => apply(q.date.toISOString(), `${code} due ${shortDate(q.date)}`)}
                  className={cn(
                    "flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors disabled:opacity-50 max-sm:h-[60px]",
                    on ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "bg-[var(--st-page)] hover:bg-[var(--st-seg)]",
                  )}
                >
                  <span className="text-[13px] font-medium max-sm:text-sm">{q.label}</span>
                  <span className={cn("text-xs", on ? "opacity-70" : "text-[var(--st-muted)]")}>{shortDate(q.date)}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-2 flex h-11 items-center gap-2.5 rounded-xl border border-[var(--st-line)] px-3 max-sm:h-12">
            <CalendarDays size={15} className="shrink-0 text-[var(--st-muted)]" />
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              defaultValue={currentYmd}
              disabled={pending}
              onChange={(e) => { if (e.target.value) apply(e.target.value, `${code} deadline set`); }}
              style={{ background: "transparent", border: 0, boxShadow: "none", color: "var(--st-ink)" }}
              className="bare-field h-full w-full text-[14px] outline-none"
            />
          </label>

          {deadline && (
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(null, `${code} deadline cleared`)}
              className="mt-1.5 flex h-10 w-full items-center justify-center rounded-xl text-[13px] text-[var(--st-late-text)] transition-colors hover:bg-[var(--st-bad-wash)] disabled:opacity-50"
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
