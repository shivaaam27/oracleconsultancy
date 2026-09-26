"use client";

/**
 * The Tasks calendar, in the Studio look (owner, 26 Sept 2026: "the calendar,
 * same apply"). Tasks sit on their deadline day; a pill shows the time when one
 * is set. Week or Month (kept in `cal=`). Overdue and No-deadline tasks sit in
 * two chips above the grid rather than on a past day, so they stay in reach.
 *
 * Reschedule three ways: drag a pill onto a day (mouse), tap a day and change a
 * date in its sheet, or change a date from the Overdue / No-deadline chips — all
 * through DeadlineEditor. A long press peeks. Optimistic, with undo.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { markPush, withReturn } from "@/lib/nav/return-to";
import { CalendarClock, CalendarOff, ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import { DeadlineEditor } from "@/components/tasks/deadline-editor";
import { PeekPreview, type PeekAction } from "@/components/tasks/peek-preview";
import { TaskContext } from "@/components/tasks/task-context";
import { hasTime } from "@/components/tasks/deadline";
import { StudioSheet } from "@/components/studio/sheet";
import { STATUS_DOT } from "@/components/studio/tasks/task-words";
import { Dot, stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";
import { triggerHaptic } from "@/lib/hooks/use-long-press";
import { useToast } from "@/components/shell/toast";
import { callUndo } from "@/components/shell/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { taskHref } from "@/lib/tasks/task-href";

const pad = (n: number) => String(n).padStart(2, "0");

/** Touch or mouse — drag-and-drop never fires on a touchscreen, so the hints
 *  say "tap its date" there. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return coarse;
}

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

  // Week | Month, kept in the `cal` search param.
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

  // Long press → peek (cleared if a drag or a scroll starts).
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

  // Cells: 42 (a six-row month) or 7 (the week containing today, from Monday).
  const cells: { date: Date; inMonth: boolean }[] = [];
  if (span === "week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
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

  // Overdue = an open task whose deadline is before today; No deadline = no
  // date. Both sit in chips above the grid rather than on a day.
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
  const dueThisMonth = rows.filter((r) => { const d = deadlineOf(r); return d && d >= first && d <= last; }).length;

  function openTask(code: string) {
    // The month you were looking at is in the address you come back to.
    const to = withReturn(taskHref(code), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
  }

  async function reschedule(code: string, day: Date) {
    const r = rows.find((x) => x.code === code);
    if (!r) return;
    const cur = deadlineOf(r);
    // Keep the time of day if the task had one; otherwise it stays all-day.
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
      toast(res.error || "Couldn't move it", { tone: "warn", duration: 3000 });
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
    const done = isClosed(r);
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
          "flex w-full min-w-0 cursor-grab select-none items-center gap-1.5 rounded-[7px] bg-[var(--st-surface)] px-1.5 py-[3px] text-left text-[12px] leading-tight shadow-[0_1px_0_rgba(17,18,20,0.04)] transition-colors hover:bg-[var(--st-line-soft)] active:cursor-grabbing",
          done && "text-[var(--st-muted)] line-through",
          dragCode === r.code && "opacity-40",
        )}
        title={pillTitle(r, dl)}
      >
        <Dot color={pillColor(r)} size={6} />
        {dl && hasTime(dl) && <span className="st-mono shrink-0 text-[11px] text-[var(--st-muted)]">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
        <span className="truncate">{r.actionItem}</span>
      </button>
    );
  }

  // A task in the Overdue / No-deadline chips: drag it onto a day, or change
  // its date in place (works on touch, where dragging does not).
  function RailRow({ r, late }: { r: TaskRow; late: boolean }) {
    const dl = deadlineOf(r);
    return (
      <div className={cn("flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-[var(--st-page)]", dragCode === r.code && "opacity-40")}>
        <button
          type="button"
          draggable
          onDragStart={(e) => startDrag(e, r.code)}
          onDragEnd={() => { setDragCode(null); setOverKey(null); }}
          onClick={() => { setRailOpen(null); openTask(r.code); }}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left active:cursor-grabbing"
          title={pillTitle(r, dl)}
        >
          <span className="st-mono shrink-0 text-[11px] text-[var(--st-muted)]">{r.code}</span>
          <span className="truncate text-[13px]">{r.actionItem}</span>
        </button>
        {/* "4d late" / "No date" in its colour — tap it to change the date. */}
        <DeadlineEditor code={r.code} deadline={dl} daysToDeadline={late && dl ? -overdueDays(dl, today) : r.daysToDeadline} studio className="shrink-0" />
      </div>
    );
  }

  const dayItems = dayOpen ? (byDay.get(dayOpen) || []) : [];
  const dayLabel = dayOpen ? new Date(dayOpen + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    ...(!isClosed(r) ? [{ label: "Move to today", icon: <CalendarClock size={15} />, onClick: () => reschedule(r.code, today) }] : []),
  ];

  const navBtn = "grid h-8 w-8 place-items-center rounded-[9px] border border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-sub)] transition-colors hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]";
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const shown = span === "week" ? 8 : 3;

  return (
    <div className="rounded-[20px] bg-[var(--st-surface)] p-3 sm:p-4">
      {/* The month, the way through it, and the two chips of tasks with no day. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="mr-auto flex min-w-0 items-baseline gap-2">
          <h2 className="whitespace-nowrap text-[17px] font-semibold tracking-[-0.01em]">{span === "week" ? weekLabel : monthLabel}</h2>
          <span className="hidden whitespace-nowrap text-[12px] text-[var(--st-muted)] sm:inline">{dueThisMonth} due this month</span>
        </div>
        <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="Span">
          {(["week", "month"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={span === s}
              onClick={() => setSpanPersist(s)}
              className={cn("h-[28px] rounded-lg px-3 text-xs transition-colors", span === s ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}
            >
              {s === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        {span === "month" && (
          <div className="flex gap-1.5">
            <Link href={buildHref(monthString(m.year, m.monthIdx - 1))} scroll={false} aria-label="Previous month" className={navBtn}><ChevronLeft size={15} /></Link>
            <Link href={buildHref(monthString(m.year, m.monthIdx + 1))} scroll={false} aria-label="Next month" className={navBtn}><ChevronRight size={15} /></Link>
          </div>
        )}
        <Link href={todayHref} scroll={false} className={stBtn.chip}>Today</Link>
      </div>

      {(overdue.length > 0 || noDeadline.length > 0) && (
        <div ref={railRef} className="mt-3 flex flex-wrap items-center gap-2">
          {overdue.length > 0 && (
            <RailButton
              open={railOpen === "overdue"}
              onToggle={() => setRailOpen((o) => (o === "overdue" ? null : "overdue"))}
              dot="var(--st-late)"
              label="Overdue"
              count={overdue.length}
              hint={coarse ? "Tap a date to move it." : "Drag one onto a day, or change its date here."}
            >
              {overdue.map((r) => <RailRow key={r.id} r={r} late />)}
            </RailButton>
          )}
          {noDeadline.length > 0 && (
            <RailButton
              open={railOpen === "none"}
              onToggle={() => setRailOpen((o) => (o === "none" ? null : "none"))}
              dot="#B9BBBF"
              label="No deadline"
              count={noDeadline.length}
              hint={coarse ? "Tap a date to give it one." : "Drag one onto a day, or give it a date here."}
            >
              {noDeadline.map((r) => <RailRow key={r.id} r={r} late={false} />)}
            </RailButton>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekdayLabels.map((w) => (
          <div key={w} className="px-1.5 pb-1 text-[11px] font-medium text-[var(--st-muted)]">{w}</div>
        ))}
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
                span === "week" ? "min-h-[200px] max-sm:min-h-[110px]" : "min-h-[108px] max-sm:min-h-[64px]",
                "flex min-w-0 flex-col gap-1 rounded-[12px] p-1.5 transition-colors",
                items.length > 0 && "cursor-pointer",
                cell.inMonth ? "bg-[var(--st-page)]" : "bg-transparent",
                isToday && "ring-1 ring-inset ring-[var(--st-ink)]",
                isOver && "bg-[var(--st-seg)] ring-2 ring-inset ring-[var(--st-field-line)]",
              )}
            >
              <span className={cn(
                "grid h-[22px] min-w-[22px] place-items-center self-start rounded-full px-1 text-[12px] tabular-nums",
                isToday ? "bg-[var(--st-ink)] font-semibold text-[var(--st-page)]" : cell.inMonth ? "text-[var(--st-sub)]" : "text-[var(--st-muted)] opacity-60",
              )}>
                {cell.date.getDate()}
              </span>
              {/* A phone's day is ~45px wide — a pill there reads "( C…". Dots
                  say how many; a tap opens the day. */}
              <div className="flex flex-wrap items-center gap-1 px-0.5 sm:hidden">
                {items.slice(0, 6).map((r) => <Dot key={r.id} color={pillColor(r)} size={6} />)}
                {items.length > 6 && <span className="text-[10px] leading-none text-[var(--st-muted)]">+{items.length - 6}</span>}
              </div>
              <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                {items.slice(0, shown).map((r) => <Pill key={r.id} r={r} />)}
                {items.length > shown && (
                  <span className="px-1.5 text-[11px] text-[var(--st-muted)] hover:text-[var(--st-ink)]">+{items.length - shown} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--st-line)] py-6 text-[13px] text-[var(--st-muted)]">
          <CalendarOff size={15} /> No tasks match these filters.
        </div>
      )}

      {/* The day, as a list — and where a date is changed on touch. */}
      <StudioSheet
        centred
        width={460}
        open={!!dayOpen}
        onClose={() => setDayOpen(null)}
        title={<>{dayLabel}<span className="ml-1.5 font-normal text-[var(--st-muted)]">{dayItems.length}</span></>}
      >
        <div className="divide-y divide-[var(--st-line-soft)]">
          {dayItems.map((r) => {
            const dl = deadlineOf(r);
            return (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <span className="mt-[7px]"><Dot color={pillColor(r)} /></span>
                <button type="button" onClick={() => { setDayOpen(null); openTask(r.code); }} className="min-w-0 flex-1 text-left">
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug">{r.actionItem}</span>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--st-muted)]">
                    {dl && hasTime(dl) && <span className="st-mono text-[11px]">{pad(dl.getHours())}:{pad(dl.getMinutes())}</span>}
                    <span className="st-mono text-[11px]">{r.code}</span>
                    <span className="truncate">{r.companyName}</span>
                    <span className="inline-flex items-center gap-1"><Dot color={STATUS_DOT[r.status] ?? "#B9BBBF"} size={6} />{r.status}</span>
                  </span>
                </button>
                <DeadlineEditor code={r.code} deadline={dl} daysToDeadline={r.daysToDeadline} studio="date" className="mt-0.5 shrink-0" />
              </div>
            );
          })}
        </div>
      </StudioSheet>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName}` : undefined}
        creator={peek?.latestActivity?.author ?? null}
        whenISO={peek?.latestActivity?.atISO ?? null}
        pills={peek ? (
          <span className="inline-flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5"><Dot color={STATUS_DOT[peek.status] ?? "#B9BBBF"} />{peek.status}</span>
            <span className="text-[var(--st-muted)]">{peek.priority} priority</span>
          </span>
        ) : undefined}
        body={peek ? <TaskContext comments={peek.comments} latestUpdate={peek.latestUpdate} /> : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />
    </div>
  );
}

/** A chip that opens a card of the tasks with no day on the grid. */
function RailButton({ open, onToggle, dot, label, count, hint, children }: {
  open: boolean;
  onToggle: () => void;
  dot: string;
  label: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn(stBtn.chip, open && "border-[var(--st-ink)]")}>
        <Dot color={dot} />
        {label}
        <span className="st-mono text-[11px] text-[var(--st-muted)]">{count}</span>
        <ChevronDown size={13} className={cn("text-[var(--st-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="st-pop absolute left-0 z-[60] mt-1.5 w-[min(380px,calc(100vw-2rem))] rounded-[16px] border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 shadow-[0_14px_36px_rgba(17,18,20,0.16)]">
          <div className="px-2 pb-1 pt-1 text-[11px] text-[var(--st-muted)]">{hint}</div>
          <div className="st-scroll max-h-[52vh] overflow-y-auto">{children}</div>
        </div>
      )}
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

/** Why this task is on this day: pink if late or escalated, amber if due soon
 *  or Critical, green when done, else the company's own colour. */
function pillColor(r: TaskRow): string {
  if (r.status === "Completed" || r.status === "Closed") return "var(--st-ok)";
  if (r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "escalated") return "var(--st-late)";
  if (r.flag === "due-soon" || r.priority === "Critical") return "var(--st-soon)";
  return r.companyAccent || "var(--st-blue)";
}
