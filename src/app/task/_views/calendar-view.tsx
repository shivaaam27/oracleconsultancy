"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, CalendarOff, CalendarClock, X, ExternalLink } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { EmptyState, Button, IconButton, LinkButton, Badge } from "@/components/ui";
import { TONE, type Tone } from "@/components/surface-kit";
import { CockpitModule } from "@/components/cockpit-module";
import { Segmented } from "@/components/macos";
import { Reveal } from "@/components/reveal";
import { DeadlineEditor } from "@/components/deadline-editor";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { TaskContext } from "@/components/task-context";
import { hasTime } from "@/components/deadline";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { taskHref } from "@/lib/task-href";

const pad = (n: number) => String(n).padStart(2, "0");

/** Coarse-pointer (touch) detection, evaluated once on the client. Used to gate
 *  the desktop-only "drag onto a day" affordance copy — drag-and-drop never fires
 *  on touchscreens, so on touch we lean on the agenda-sheet / rail reschedule. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return coarse;
}

/**
 * Time-aware task calendar (Aurora). Tasks are bucketed by deadline day; a pill
 * shows the time when one is set. Today is highlighted. A Week/Month toggle in the
 * header switches between a 7-day strip and the full month (persisted in `cal=`).
 * Two rails sit above the grid — Overdue and No-deadline. Reschedule three ways:
 * drag a pill onto a day (pointer devices), tap a day → reschedule a row from the
 * agenda sheet, or reschedule a rail chip in place — all via the kit DeadlineEditor.
 * Long-press a pill for a peek. Optimistic + undo throughout; reduced-motion safe.
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
  const coarse = useCoarsePointer();

  // Week | Month, persisted in the `cal` search param (read on mount).
  const [span, setSpan] = useState<"week" | "month">(searchParams.get("cal") === "week" ? "week" : "month");
  function setSpanPersist(next: "week" | "month") {
    setSpan(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "week") params.set("cal", "week"); else params.delete("cal");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Optimistic deadline overrides (code → Date|null) so a dropped pill moves now.
  const [moved, setMoved] = useState<Record<string, Date | null>>({});
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState<null | "overdue" | "none">(null);
  const [peek, setPeek] = useState<TaskRow | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Long-press → peek (cleared if a drag or scroll starts). Mirrors board-view.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onPillPointerDown(r: TaskRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(r); }, 400);
  }
  function onPillPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }

  useEffect(() => {
    if (!railOpen) return;
    const onDoc = (e: MouseEvent) => { if (railRef.current && !railRef.current.contains(e.target as Node)) setRailOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setRailOpen(null); };
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

  // Cells: 42 (6-row month grid) or 7 (the week containing today, Monday-start).
  const cells: { date: Date; inMonth: boolean }[] = [];
  if (span === "week") {
    const ref = new Date(today);
    const startWeekday = (ref.getDay() + 6) % 7; // 0 = Monday
    const weekStart = new Date(ref);
    weekStart.setDate(ref.getDate() - startWeekday);
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      cells.push({ date: d, inMonth: true });
    }
  } else {
    const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
    for (let i = 0; i < 42; i++) {
      const d = new Date(first);
      d.setDate(1 - startWeekday + i);
      cells.push({ date: d, inMonth: d.getMonth() === m.monthIdx });
    }
  }

  // Overdue = open task whose (optimistic) deadline is before today. These show in
  // a rail rather than on a past day, so they stay actionable. No-deadline = no date.
  const byDay = new Map<string, TaskRow[]>();
  const overdue: TaskRow[] = [];
  const noDeadline: TaskRow[] = [];
  const isClosed = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
  for (const r of rows) {
    const dl = deadlineOf(r);
    if (!dl) { noDeadline.push(r); continue; }
    if (!isClosed(r) && dl < today) { overdue.push(r); continue; }
    const k = ymd(dl);
    const list = byDay.get(k) || [];
    list.push(r);
    byDay.set(k, list);
  }
  const ORDER = ["Critical", "High", "Medium", "Low"];
  const byPriority = (a: TaskRow, b: TaskRow) =>
    ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || a.code.localeCompare(b.code);
  for (const list of byDay.values()) list.sort(byPriority);
  overdue.sort((a, b) => {
    const da = deadlineOf(a), db = deadlineOf(b);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0) || byPriority(a, b);
  });

  const prev = monthString(m.year, m.monthIdx - 1);
  const next = monthString(m.year, m.monthIdx + 1);
  const buildHref = (mm: string) => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    params.set("month", mm);
    if (span === "week") params.set("cal", "week");
    return `/?${params.toString()}`;
  };
  const todayHref = (() => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    if (span === "week") params.set("cal", "week");
    return `/?${params.toString()}`;
  })();

  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const weekLabel = (() => {
    const a = cells[0]?.date, b = cells[6]?.date;
    if (!a || !b) return monthLabel;
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${fmt(a)} – ${fmt(b)}`;
  })();
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dueThisMonth = rows.filter((r) => { const d = deadlineOf(r); return d && d >= first && d <= last; }).length;

  function openTask(code: string) {
    router.push(taskHref(code));
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

  function startDrag(e: React.DragEvent, code: string) {
    setDragCode(code);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", code);
  }

  function Pill({ r }: { r: TaskRow }) {
    const dl = deadlineOf(r);
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => startDrag(e, r.code)}
        onDragEnd={() => { setDragCode(null); setOverKey(null); }}
        onPointerDown={(e) => onPillPointerDown(r, e)}
        onPointerMove={onPillPointerMove}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        onClick={(e) => { e.stopPropagation(); if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
        className={cn(
          "block w-full truncate text-left text-[11px] leading-tight px-1.5 py-0.5 rounded-md border-l-2 select-none",
          "transition-colors hover:bg-bg-muted/70 cursor-grab active:cursor-grabbing",
          dragCode === r.code && "opacity-40"
        )}
        style={{ borderLeftColor: pillColor(r) }}
        title={pillTitle(r, dl)}
      >
        {dl && hasTime(dl) && <span className="font-mono text-fg-subtle mr-1">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
        {r.actionItem}
      </button>
    );
  }

  // A rail chip (Overdue / No-deadline popovers). Drag-to-schedule on pointer
  // devices; a per-chip DeadlineEditor gives a touch-friendly reschedule too.
  function RailChip({ r, tone }: { r: TaskRow; tone: Tone }) {
    const dl = deadlineOf(r);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 max-w-[300px] text-[11px] px-2 py-1 rounded-md border-l-2",
          "bg-bg-subtle/80 transition-colors",
          dragCode === r.code && "opacity-40"
        )}
        style={{ borderLeftColor: TONE[tone].stroke }}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => startDrag(e, r.code)}
          onDragEnd={() => { setDragCode(null); setOverKey(null); }}
          onClick={() => { setRailOpen(null); openTask(r.code); }}
          className="inline-flex items-center gap-1.5 min-w-0 cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity"
          title={pillTitle(r, dl)}
        >
          <span className="font-mono text-fg-muted shrink-0">{r.code}</span>
          <span className="truncate">{r.actionItem}</span>
          {tone === "danger" && dl && (
            <span className="shrink-0 tabular text-danger font-medium">{overdueDays(dl, today)}d</span>
          )}
        </button>
        <DeadlineEditor code={r.code} deadline={dl} daysToDeadline={r.daysToDeadline} className="shrink-0" />
      </span>
    );
  }

  const dayItems = dayOpen ? (byDay.get(dayOpen) || []) : [];
  const dayLabel = dayOpen ? new Date(dayOpen + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  const peekActions = (r: TaskRow): PeekAction[] => {
    const done = r.status === "Completed" || r.status === "Closed";
    return [
      { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
      ...(!done ? [{ label: "Move to today", icon: <CalendarClock size={15} />, onClick: () => reschedule(r.code, today) }] : []),
    ];
  };

  // The month-nav cluster — lives in the CockpitModule action slot.
  const nav = (
    <div className="flex items-center gap-1">
      <Segmented
        size="sm"
        value={span}
        onChange={(v) => setSpanPersist(v)}
        options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]}
      />
      {span === "month" && (
        <>
          <LinkButton href={buildHref(prev)} variant="ghost" size="sm" className="w-8 px-0" aria-label="Previous month"><ChevronLeft size={15} /></LinkButton>
          <LinkButton href={buildHref(next)} variant="ghost" size="sm" className="w-8 px-0" aria-label="Next month"><ChevronRight size={15} /></LinkButton>
        </>
      )}
      <LinkButton href={todayHref} variant="ghost" size="sm" className="ml-0.5">Today</LinkButton>
    </div>
  );

  return (
    <Reveal className="space-y-3">
      {/* Rails: Overdue + No-deadline. Compact buttons → glass popovers; reschedule a chip in place. */}
      {(overdue.length > 0 || noDeadline.length > 0) && (
        <div ref={railRef} className="flex flex-wrap items-center gap-2">
          {overdue.length > 0 && (
            <RailButton
              open={railOpen === "overdue"}
              onToggle={() => setRailOpen((o) => (o === "overdue" ? null : "overdue"))}
              onEnter={() => setRailOpen("overdue")}
              tone="danger"
              icon={<CalendarClock size={12} />}
              label="Overdue"
              count={overdue.length}
              hint={coarse ? "Tap a chip's date to reschedule." : "Drag any onto a day, or tap its date, to reschedule."}
            >
              {overdue.map((r) => <RailChip key={r.id} r={r} tone="danger" />)}
            </RailButton>
          )}
          {noDeadline.length > 0 && (
            <RailButton
              open={railOpen === "none"}
              onToggle={() => setRailOpen((o) => (o === "none" ? null : "none"))}
              onEnter={() => setRailOpen("none")}
              tone="muted"
              icon={<CalendarOff size={12} />}
              label="No deadline"
              count={noDeadline.length}
              hint={coarse ? "Tap a chip's date to schedule." : "Drag any onto a day, or tap its date, to schedule."}
            >
              {noDeadline.map((r) => <RailChip key={r.id} r={r} tone="muted" />)}
            </RailButton>
          )}
        </div>
      )}

      {/* Grid in a kit CockpitModule; month nav lives in its action slot. */}
      <CockpitModule
        title={
          <span className="inline-flex items-center gap-2">
            <span className="whitespace-nowrap">{span === "week" ? weekLabel : monthLabel}</span>
            {/* The header is title-left, nav-right in one row. On a phone the
                two together ran past 343px, so the row squeezed and "AUGUST
                2026 · 21 DUE THIS MONTH" broke into four stacked lines beside
                the buttons. The count goes; the month and the nav fit. */}
            <span className="hidden text-xs font-normal text-fg-subtle tabular sm:inline">· {dueThisMonth} due this month</span>
          </span>
        }
        action={nav}
        className="!p-2 sm:!p-3"
      >
        <div className="elevated rounded-2xl overflow-hidden ring-1 ring-border/50">
          <div className="grid grid-cols-7 border-b border-border/70">
            {weekdayLabels.map((w) => (
              <div key={w} className="px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-fg-subtle text-center">{w}</div>
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
                  className={cn(
                    span === "week" ? "min-h-[200px] max-sm:min-h-[110px]" : "min-h-[104px] max-sm:min-h-[68px]",
                    "border-b border-r border-border/60 last:border-r-0 p-1.5 space-y-1 transition-colors",
                    items.length && "cursor-pointer",
                    isOver
                      ? "bg-accent/10 ring-1 ring-accent/40 ring-inset"
                      : isToday
                        ? "bg-accent-soft/30"
                        : cell.inMonth ? "bg-bg-elev hover:bg-bg-muted/30" : "bg-bg-subtle/40"
                  )}
                >
                  <div className={cn(
                    "text-[10px] tabular inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full",
                    isToday ? "bg-accent text-accent-fg font-semibold" : cell.inMonth ? "text-fg-muted" : "text-fg-subtle"
                  )}>
                    {cell.date.getDate()}
                  </div>
                  {/* A phone gives each day about 53px, and a task pill in 53px
                      reads "( C…" — a title you cannot recognise sitting in a
                      cell you cannot use. Dots instead, one per task and
                      coloured the same way, which is what every phone calendar
                      does: the day says HOW MUCH, and tapping it opens the day
                      sheet, which says what. The pills stay from `sm` up, where
                      a cell is wide enough to read one. */}
                  <div className="flex flex-wrap items-center gap-1 sm:hidden">
                    {items.slice(0, 6).map((r) => (
                      <span key={r.id} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: pillColor(r) }} />
                    ))}
                    {items.length > 6 && (
                      <span className="text-[9px] leading-none text-fg-subtle">+{items.length - 6}</span>
                    )}
                  </div>
                  <div className="hidden space-y-1 sm:block">
                    {items.slice(0, span === "week" ? 8 : 3).map((r) => <Pill key={r.id} r={r} />)}
                    {items.length > (span === "week" ? 8 : 3) && (
                      <div className="text-[10px] text-fg-subtle px-1 hover:text-accent transition-colors">+{items.length - (span === "week" ? 8 : 3)} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CockpitModule>

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
              className="fixed z-[86] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] mx-auto max-h-[80svh] overflow-hidden flex flex-col glass glass-menu elevated rounded-3xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <div className="text-sm font-semibold tracking-tight">{dayLabel}<span className="text-fg-subtle font-normal"> · {dayItems.length}</span></div>
                <IconButton size="sm" onClick={() => setDayOpen(null)} aria-label="Close"><X size={15} /></IconButton>
              </div>
              <div className="overflow-y-auto divide-y divide-border/50">
                {dayItems.map((r) => {
                  const dl = deadlineOf(r);
                  const st = statusTone(r.status);
                  return (
                    <div key={r.id} className="px-4 py-3 hover:bg-bg-muted/50 transition-colors flex items-start gap-2.5">
                      {/* The leading dot: red late, amber due soon, else the
                          company's colour. See `pillColor` — it painted nothing
                          at all until the HSL triplet was wrapped. */}
                      <span className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: pillColor(r) }} />
                      <button type="button" onClick={() => { setDayOpen(null); openTask(r.code); }} className="min-w-0 flex-1 text-left">
                        <span className="text-sm leading-snug line-clamp-2">{r.actionItem}</span>
                        {r.comments && r.comments.trim() && (
                          <span className="block text-xs text-fg-muted truncate mt-0.5">{r.comments}</span>
                        )}
                        <span className="block text-xs text-fg-subtle mt-1 inline-flex items-center gap-1.5">
                          {dl && hasTime(dl) && <span className="font-mono">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
                          <span>{r.code} · {r.companyName}</span>
                          <span className={cn("inline-flex items-center gap-1", TONE[st].text)}>
                            <span className="inline-block w-1 h-1 rounded-full" style={{ backgroundColor: TONE[st].stroke }} />
                            {r.status}
                          </span>
                        </span>
                      </button>
                      {/* Touch-friendly reschedule — works where drag does not. */}
                      <DeadlineEditor code={r.code} deadline={dl} daysToDeadline={r.daysToDeadline} className="shrink-0 mt-0.5" />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Long-press peek on a pill (reuses the table/board pattern). */}
      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName}` : undefined}
        creator={peek?.latestActivity?.author ?? null}
        whenISO={peek?.latestActivity?.atISO ?? null}
        pills={peek ? (
          <>
            <Badge tone={badgeTone(statusTone(peek.status))}>{peek.status}</Badge>
            <Badge tone="default">{peek.priority}</Badge>
          </>
        ) : undefined}
        body={peek ? <TaskContext comments={peek.comments} latestUpdate={peek.latestUpdate} /> : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />
    </Reveal>
  );
}

/** A compact rail trigger that opens a glass popover of draggable chips. */
function RailButton({
  open, onToggle, onEnter, tone, icon, label, count, hint, children,
}: {
  open: boolean;
  onToggle: () => void;
  onEnter: () => void;
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-block" onMouseEnter={onEnter}>
      <Button type="button" variant="secondary" size="sm" onClick={onToggle}>
        <span className={tone === "danger" ? "text-danger" : ""}>{icon}</span>
        {label}
        <span className="tabular text-fg-subtle">· {count}</span>
        <ChevronDown size={12} className={cn("opacity-50 transition-transform", open && "rotate-180")} />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -2 }} transition={spring}
            style={{ transformOrigin: "top left" }}
            className="absolute z-[60] mt-1.5 left-0 w-[340px] max-h-[52vh] overflow-y-auto glass glass-menu elevated rounded-2xl p-2"
          >
            <div className="text-[11px] text-fg-subtle px-1 pb-1.5">{hint}</div>
            <div className="flex flex-col gap-1.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function overdueDays(dl: Date, today: Date): number {
  const a = new Date(dl); a.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - a.getTime()) / 86400000));
}

function pillTitle(r: TaskRow, dl: Date | null): string {
  const when = dl
    ? dl.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + (hasTime(dl) ? ` ${pad(dl.getHours())}:${pad(dl.getMinutes())}` : "")
    : "No deadline";
  return `${r.code} · ${r.actionItem}\n${when} · ${r.status}`;
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

function statusTone(s: string): Tone {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "muted";
}

/** Map a surface-kit Tone to the Badge component's narrower tone set. */
function badgeTone(t: Tone): "default" | "success" | "warn" | "danger" | "info" {
  if (t === "success") return "success";
  if (t === "warn") return "warn";
  if (t === "danger") return "danger";
  if (t === "info") return "info";
  return "default";
}

/**
 * The colour that says WHY this task is on this day: red if it is late or
 * escalated, amber if it is due soon, otherwise the company's own accent.
 *
 * ⚠️ These used to be returned as bare `var(--danger)` / `var(--warn)` /
 * `var(--accent)`, and those custom properties hold an HSL TRIPLET
 * ("0 81% 69%"), not a colour — so as a `background-color` or a
 * `border-left-color` they were invalid and painted NOTHING. It hid for a long
 * time because the last branch returns the company's own hex, which is a real
 * colour, so only the overdue / due-soon / Critical rows were affected: exactly
 * the ones whose colour carries the warning. Wrap the triplet and they paint.
 */
function pillColor(r: TaskRow): string {
  if (r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "escalated") return "hsl(var(--danger))";
  if (r.flag === "due-soon") return "hsl(var(--warn))";
  if (r.priority === "Critical") return "hsl(var(--danger))";
  return r.companyAccent || "hsl(var(--accent))";
}
