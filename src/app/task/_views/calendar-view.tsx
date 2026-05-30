"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, CalendarOff, X, ExternalLink } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { EmptyState } from "@/components/ui";
import { hasTime } from "@/components/deadline";
import { spring } from "@/lib/motion";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Month calendar, time-aware. Tasks are bucketed by deadline day; a pill shows
 * the time when one is set. Tap a day to open its agenda sheet; drag a pill onto
 * another day to reschedule (keeping the time of day). No-deadline tasks sit in a
 * rail above the grid and can be dragged onto a day to give them one.
 */
export function CalendarView({
  rows, month, queryWithoutMonth,
}: {
  rows: TaskRow[];
  month: string | undefined;
  queryWithoutMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Optimistic deadline overrides (code → Date|null) so a dropped pill moves now.
  const [moved, setMoved] = useState<Record<string, Date | null>>({});
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!railOpen) return;
    const onDoc = (e: MouseEvent) => { if (railRef.current && !railRef.current.contains(e.target as Node)) setRailOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setRailOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [railOpen]);

  const deadlineOf = (r: TaskRow) => (r.code in moved ? moved[r.code] : r.deadline);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const m = parseMonth(month) ?? { year: today.getFullYear(), monthIdx: today.getMonth() };
  const first = new Date(m.year, m.monthIdx, 1);
  const last = new Date(m.year, m.monthIdx + 1, 0);

  const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(1 - startWeekday + i);
    cells.push({ date: d, inMonth: d.getMonth() === m.monthIdx });
  }

  const byDay = new Map<string, TaskRow[]>();
  const noDeadline: TaskRow[] = [];
  for (const r of rows) {
    const dl = deadlineOf(r);
    if (!dl) { noDeadline.push(r); continue; }
    const k = ymd(dl);
    const list = byDay.get(k) || [];
    list.push(r);
    byDay.set(k, list);
  }
  const ORDER = ["Critical", "High", "Medium", "Low"];
  for (const list of byDay.values()) {
    list.sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || a.code.localeCompare(b.code));
  }

  const prev = monthString(m.year, m.monthIdx - 1);
  const next = monthString(m.year, m.monthIdx + 1);
  const buildHref = (mm: string) => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    params.set("month", mm);
    return `/?${params.toString()}`;
  };
  const todayHref = (() => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    return `/?${params.toString()}`;
  })();

  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function reschedule(code: string, day: Date) {
    const r = rows.find((x) => x.code === code);
    if (!r) return;
    const cur = deadlineOf(r);
    // Keep the time of day if the task had one; otherwise leave it all-day.
    const next = new Date(day);
    if (cur && hasTime(cur)) next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    else next.setHours(0, 0, 0, 0);
    const value = cur && hasTime(cur)
      ? `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`
      : `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;

    setMoved((mm) => ({ ...mm, [code]: next }));
    triggerHaptic();
    const res = await inlineUpdateTask(code, "deadline", value);
    if (res.ok) {
      const when = next.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      toast(`${code} moved to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setMoved((mm) => { const n = { ...mm }; delete n[code]; return n; }); router.refresh(); } } : undefined });
    } else {
      setMoved((mm) => { const n = { ...mm }; delete n[code]; return n; });
      toast(res.error || "Move failed", { tone: "warn", duration: 3000 });
    }
    router.refresh();
  }

  function Pill({ r }: { r: TaskRow }) {
    const dl = deadlineOf(r);
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => { setDragCode(r.code); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.code); }}
        onDragEnd={() => { setDragCode(null); setOverKey(null); }}
        onClick={(e) => { e.stopPropagation(); openTask(r.code); }}
        className={"block w-full truncate text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 hover:bg-bg-muted cursor-grab active:cursor-grabbing " + (dragCode === r.code ? "opacity-40" : "")}
        style={{ borderLeftColor: pillColor(r) }}
        title={`${r.code} · ${r.actionItem}`}
      >
        {dl && hasTime(dl) && <span className="font-mono text-fg-subtle mr-1">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
        {r.actionItem}
      </button>
    );
  }

  const dayItems = dayOpen ? (byDay.get(dayOpen) || []) : [];
  const dayLabel = dayOpen ? new Date(dayOpen + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link href={buildHref(prev)} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted" aria-label="Previous month"><ChevronLeft size={14} /></Link>
          <Link href={buildHref(next)} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted" aria-label="Next month"><ChevronRight size={14} /></Link>
          <Link href={todayHref} className="text-xs px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">Today</Link>
          <div className="ml-2 text-sm font-medium">{monthLabel}</div>
        </div>
        <div className="text-xs text-fg-subtle">
          {rows.filter((r) => { const d = deadlineOf(r); return d && d >= first && d <= last; }).length} due this month
        </div>
      </div>

      {/* No-deadline: compact button → hover/click popover (still drag-to-schedule) */}
      {noDeadline.length > 0 && (
        <div ref={railRef} className="relative inline-block" onMouseEnter={() => setRailOpen(true)}>
          <button
            type="button"
            onClick={() => setRailOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg-elev text-fg-muted hover:text-fg hover:bg-bg-muted btn-rim transition-colors"
          >
            <CalendarOff size={12} /> No deadline <span className="tabular text-fg-subtle">· {noDeadline.length}</span>
            <ChevronDown size={12} className={"opacity-50 transition-transform " + (railOpen ? "rotate-180" : "")} />
          </button>
          <AnimatePresence>
            {railOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -2 }} transition={spring}
                style={{ transformOrigin: "top left" }}
                className="absolute z-[60] mt-1.5 left-0 w-[340px] max-h-[52vh] overflow-y-auto glass glass-menu rounded-xl p-2"
              >
                <div className="text-[11px] text-fg-subtle px-1 pb-1.5">Drag any onto a day to schedule.</div>
                <div className="flex flex-wrap gap-1.5">
                  {noDeadline.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      draggable
                      onDragStart={(e) => { setDragCode(r.code); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.code); }}
                      onDragEnd={() => { setDragCode(null); setOverKey(null); setRailOpen(false); }}
                      onClick={() => { setRailOpen(false); openTask(r.code); }}
                      className="text-[11px] px-2 py-1 rounded-md bg-bg-subtle hover:bg-bg-muted truncate max-w-[300px] cursor-grab active:cursor-grabbing"
                      title={r.actionItem}
                    >
                      <span className="font-mono text-fg-muted mr-1">{r.code}</span>{r.actionItem}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Grid */}
      <div className="elevated bg-bg-elev rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map((w) => (
            <div key={w} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-fg-subtle text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const k = ymd(cell.date);
            const items = byDay.get(k) || [];
            const isToday = ymd(today) === k;
            const isOver = overKey === k;
            return (
              <div
                key={i}
                onDragOver={(e) => { e.preventDefault(); setOverKey(k); }}
                onDragLeave={() => setOverKey((s) => (s === k ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (dragCode) reschedule(dragCode, cell.date); setDragCode(null); setOverKey(null); }}
                onClick={() => { if (items.length) setDayOpen(k); }}
                className={
                  "min-h-[104px] border-b border-r border-border last:border-r-0 p-1.5 space-y-1 transition-colors " +
                  (items.length ? "cursor-pointer " : "") +
                  (isOver ? "bg-accent/10 ring-1 ring-accent/40 ring-inset " : cell.inMonth ? "bg-bg-elev" : "bg-bg-subtle/40")
                }
              >
                <div className={"text-[10px] tabular inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full " + (isToday ? "bg-accent text-accent-fg font-semibold" : cell.inMonth ? "text-fg-muted" : "text-fg-subtle")}>
                  {cell.date.getDate()}
                </div>
                {items.slice(0, 3).map((r) => <Pill key={r.id} r={r} />)}
                {items.length > 3 && <div className="text-[10px] text-fg-subtle px-1 hover:text-accent">+{items.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && (
        <EmptyState icon={<CalendarOff size={28} />} title="No tasks in scope." hint="Adjust filters or pick a different view." />
      )}

      {/* Day agenda sheet */}
      <AnimatePresence>
        {dayOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setDayOpen(null)} className="fixed inset-0 z-[85] bg-black/45 backdrop-blur-[3px]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={spring}
              className="fixed z-[86] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] mx-auto max-h-[80svh] overflow-hidden flex flex-col glass glass-menu rounded-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <div className="text-sm font-semibold">{dayLabel}<span className="text-fg-subtle font-normal"> · {dayItems.length}</span></div>
                <button type="button" onClick={() => setDayOpen(null)} className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-fg-muted hover:bg-bg-muted"><X size={15} /></button>
              </div>
              <div className="overflow-y-auto divide-y divide-border/60">
                {dayItems.map((r) => {
                  const dl = deadlineOf(r);
                  return (
                    <button key={r.id} type="button" onClick={() => { setDayOpen(null); openTask(r.code); }} className="w-full text-left px-4 py-3 hover:bg-bg-muted/60 transition-colors flex items-start gap-2.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: pillColor(r) }} />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm leading-snug line-clamp-2">{r.actionItem}</span>
                        <span className="block text-xs text-fg-muted mt-0.5">
                          {dl && hasTime(dl) && <span className="font-mono mr-1.5">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
                          {r.code} · {r.companyName} · {r.status}
                        </span>
                      </span>
                      <ExternalLink size={14} className="text-fg-subtle shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseMonth(s: string | undefined): { year: number; monthIdx: number } | null {
  if (!s) return null;
  const match = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { year, monthIdx };
}

function monthString(year: number, monthIdx: number): string {
  const d = new Date(year, monthIdx, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function pillColor(r: TaskRow): string {
  if (r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "escalated") return "var(--danger)";
  if (r.flag === "due-soon") return "var(--warn)";
  if (r.priority === "Critical") return "var(--danger)";
  return r.companyAccent || "var(--accent)";
}
