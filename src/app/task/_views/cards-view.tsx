"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  BellRing,
  Calendar,
  Check,
  ChevronDown,
  HelpCircle,
  MessageSquarePlus,
  SkipForward,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { useSwipeRow } from "@/lib/use-swipe-row";
import type { TaskRow } from "@/lib/queries";
import { adminRemindTask, inlineUpdateTask } from "@/app/task/actions";
import { SelectCheckbox, OrderRegistrar } from "./selection";

/* Cards view — the Command Centre Tasks page's default view (portal-twin card
 * list, owner-grade) + the Focus queue mode. Approved composition:
 * memory/command_centre_unification.md. Cards carry: code · title · late badge ·
 * quiet/fresh badge · Remind + Escalate · assignee line with the latest update
 * quote when fresh · select checkbox. Group headers (company/status/person)
 * collapse; person headers get "Remind all N" (one consolidated Outbox-style
 * draft via adminRemindTask allTasks). Mobile: swipe left = remind. */

const DAY = 86_400_000;

const PRIORITY_DOT: Record<string, string> = {
  Critical: "bg-danger",
  High: "bg-warn",
  Medium: "bg-accent",
  Low: "bg-border",
};

type Enriched = {
  r: TaskRow;
  /** Whole days late (>0) or null. */
  late: number | null;
  /** Whole days until due (0 = today) or null. */
  dueIn: number | null;
  /** Days since the last update (null = never updated). */
  quiet: number | null;
};

function enrich(r: TaskRow, nowMs: number): Enriched {
  const dl = r.deadline ? Math.floor((nowMs - r.deadline.getTime()) / DAY) : null;
  const late = dl !== null && dl > 0 ? dl : null;
  const du = r.deadline ? Math.ceil((r.deadline.getTime() - nowMs) / DAY) : null;
  const dueIn = du !== null && du >= 0 ? du : null;
  const quiet = r.lastUpdatedAt ? Math.floor((nowMs - r.lastUpdatedAt.getTime()) / DAY) : null;
  return { r, late, dueIn, quiet };
}

function dueBadge(e: Enriched): { label: string; tone: "danger" | "warn" | "muted" } | null {
  if (e.late !== null) return { label: `${e.late}d late`, tone: "danger" };
  if (e.dueIn !== null && e.dueIn <= 3) return { label: e.dueIn === 0 ? "due today" : `in ${e.dueIn}d`, tone: "warn" };
  if (!e.r.deadline) return { label: "no deadline", tone: "muted" };
  return null;
}

/** quiet ≥7d → amber "quiet Nd"; updated <2d ago → green "fresh". */
function quietBadge(e: Enriched): { label: string; tone: "warn" | "ok" } | null {
  const open = e.r.status !== "Completed" && e.r.status !== "Closed";
  if (!open) return null;
  if (e.quiet !== null && e.quiet >= 7) return { label: `quiet ${e.quiet}d`, tone: "warn" };
  if (e.quiet !== null && e.quiet < 2) return { label: "fresh", tone: "ok" };
  return null;
}

/* ------------------------------- One task card ------------------------------- */

function TaskCard({ e, selectMode }: { e: Enriched; selectMode: boolean }) {
  const { r } = e;
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const { swiped, offset, dragging, bind, reset } = useSwipeRow({ rightWidth: 92 });

  const due = dueBadge(e);
  const qb = quietBadge(e);
  const fresh = qb?.tone === "ok" && r.latestUpdate;

  function remind() {
    setBusy("remind");
    start(async () => {
      const res = await adminRemindTask(r.id);
      setBusy(null);
      reset();
      if (!res.ok) return toast(res.error, { tone: "warn" });
      if (res.link) window.open(res.link, "_blank");
      toast(res.contactMissing ? `${res.name} has no ${res.channel.toLowerCase()} contact saved.` : `Reminder ready for ${res.name}.`, {
        tone: res.contactMissing ? "warn" : "success",
      });
    });
  }
  function escalate() {
    setBusy("esc");
    start(async () => {
      const res = await inlineUpdateTask(r.code, "status", "Escalated");
      setBusy(null);
      if (!res.ok) return toast(res.error ?? "Could not escalate.", { tone: "warn" });
      toast(`${r.code} escalated.`, { tone: "success" });
      router.refresh();
    });
  }

  const iconBtn =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-wait";

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Swipe tray (mobile) — hidden until the gesture starts. */}
      <div className={cn("absolute inset-y-0 right-0 flex w-[92px] items-stretch", offset === 0 && !swiped && "hidden")}>
        <button
          type="button"
          onClick={remind}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-warn-soft/70 text-[11px] font-semibold text-warn"
        >
          <BellRing size={15} /> Remind
        </button>
      </div>
      <div
        {...bind}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)" }}
        className="relative touch-pan-y"
      >
        <div
          className={cn(
            "rounded-2xl bg-bg-elev/60 px-3.5 py-2.5 ring-1 transition-all hover:ring-accent/30",
            r.unread ? "ring-accent/30" : "ring-border/70",
          )}
        >
          <div className="flex items-center gap-2">
            {selectMode && <SelectCheckbox code={r.code} />}
            <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[r.priority] ?? "bg-border")} title={`${r.priority} priority`} />
            <Link
              href={`/?tab=tasks&task=${encodeURIComponent(r.code)}`}
              onClick={(ev) => {
                if (swiped) {
                  ev.preventDefault();
                  reset();
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span className="shrink-0 rounded-md bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular text-fg-muted ring-1 ring-border/60">
                {r.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-accent">{r.actionItem}</span>
            </Link>
            {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="New activity since you last looked" />}
            {due && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular ring-1",
                  due.tone === "danger" && "bg-danger-soft/60 text-danger ring-danger/20",
                  due.tone === "warn" && "bg-warn-soft/60 text-warn ring-warn/25",
                  due.tone === "muted" && "bg-bg-subtle text-fg-subtle ring-border/60",
                )}
              >
                {due.label}
              </span>
            )}
            {qb && (
              <span
                className={cn(
                  "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 sm:inline",
                  qb.tone === "warn" ? "bg-warn-soft/60 text-warn ring-warn/25" : "bg-success-soft/60 text-success ring-success/20",
                )}
              >
                {qb.label}
              </span>
            )}
            <span className="hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={remind}
                disabled={busy === "remind"}
                title="Remind (WhatsApp/email, their preferred channel)"
                className={cn(iconBtn, "bg-warn-soft/50 text-warn ring-warn/25")}
              >
                <BellRing size={13} />
              </button>
              <button
                type="button"
                onClick={escalate}
                disabled={busy === "esc" || r.status === "Escalated"}
                title={r.status === "Escalated" ? "Already escalated" : "Escalate"}
                className={cn(iconBtn, "bg-danger-soft/50 text-danger ring-danger/20")}
              >
                <Zap size={13} />
              </button>
              <Link
                href={`/?tab=tasks&task=${encodeURIComponent(r.code)}`}
                title="Open + add an update"
                className={cn(iconBtn, "bg-accent-soft/60 text-accent ring-accent/20")}
              >
                <MessageSquarePlus size={13} />
              </Link>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 pl-4 text-[11px] text-fg-subtle">
            <span className="min-w-0 flex-1 truncate">
              {r.companyName}
              {r.assignees.length > 0 && <> · {r.assignees.join(", ")}</>} · {r.status}
              {fresh && <span className="text-success"> · “{r.latestUpdate}”</span>}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------- Grouped list -------------------------------- */

export type CardsGroupBy = "company" | "status" | "person" | null;

function groupKey(r: TaskRow, g: CardsGroupBy): string {
  if (g === "status") return r.status;
  if (g === "person") return r.assignees[0] ?? "Unassigned";
  return r.companyName || "No company";
}

function GroupHeader({
  label,
  items,
  collapsed,
  onToggle,
  remindAll,
}: {
  label: string;
  items: Enriched[];
  collapsed: boolean;
  onToggle: () => void;
  remindAll?: () => void;
}) {
  const overdue = items.filter((e) => e.late !== null).length;
  const quiet = items.filter((e) => quietBadge(e)?.tone === "warn").length;
  return (
    <div className="mt-3 flex items-center gap-2 first:mt-0">
      <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-1.5 text-left">
        <ChevronDown size={13} className={cn("shrink-0 text-fg-subtle transition-transform", collapsed && "-rotate-90")} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">{label}</span>
      </button>
      {overdue > 0 && (
        <span className="rounded-full bg-danger-soft/60 px-2 py-0.5 text-[10px] font-semibold text-danger ring-1 ring-danger/20">
          {overdue} overdue
        </span>
      )}
      {quiet > 0 && (
        <span className="hidden rounded-full bg-warn-soft/60 px-2 py-0.5 text-[10px] font-semibold text-warn ring-1 ring-warn/25 sm:inline">
          😶 {quiet} quiet
        </span>
      )}
      <span className="text-[10px] text-fg-subtle">{items.length} task{items.length === 1 ? "" : "s"}</span>
      {remindAll && overdue > 0 && (
        <button
          type="button"
          onClick={remindAll}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-soft/70 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20 transition-all hover:-translate-y-0.5"
        >
          <BellRing size={11} /> Remind all
        </button>
      )}
    </div>
  );
}

export function CardsView({ rows, groupBy }: { rows: TaskRow[]; groupBy: CardsGroupBy }) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const nowMs = Date.now();

  const enriched = useMemo(() => rows.map((r) => enrich(r, nowMs)), [rows, nowMs]);

  // Worst-first inside each group: most late, then quietest, then due-soonest.
  const sorted = useMemo(
    () =>
      [...enriched].sort(
        (a, b) => (b.late ?? -1) - (a.late ?? -1) || (b.quiet ?? -1) - (a.quiet ?? -1) || (a.dueIn ?? 9999) - (b.dueIn ?? 9999),
      ),
    [enriched],
  );

  const groups = useMemo(() => {
    if (!groupBy) return [["", sorted] as const];
    const m = new Map<string, Enriched[]>();
    for (const e of sorted) {
      const k = groupKey(e.r, groupBy);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    // Worst group first (by overdue count, then size).
    return [...m.entries()].sort(
      (a, b) =>
        b[1].filter((e) => e.late !== null).length - a[1].filter((e) => e.late !== null).length || b[1].length - a[1].length,
    );
  }, [sorted, groupBy]);

  function remindAllFor(items: Enriched[]) {
    const first = items.find((e) => e.r.status !== "Completed" && e.r.status !== "Closed");
    if (!first) return;
    start(async () => {
      const res = await adminRemindTask(first.r.id, true);
      if (!res.ok) return toast(res.error, { tone: "warn" });
      if (res.link) window.open(res.link, "_blank");
      toast(`Full task list ready for ${res.name}.`, { tone: "success" });
    });
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <OrderRegistrar codes={rows.map((r) => r.code)} />
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setSelectMode((s) => !s)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors",
            selectMode ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle/60 text-fg-muted ring-border/60 hover:text-fg",
          )}
        >
          <Check size={12} /> {selectMode ? "Done selecting" : "Select"}
        </button>
      </div>
      {groups.map(([label, items]) => (
        <div key={label || "all"}>
          {groupBy && (
            <GroupHeader
              label={label}
              items={items}
              collapsed={collapsed.has(label)}
              onToggle={() =>
                setCollapsed((s) => {
                  const n = new Set(s);
                  if (n.has(label)) n.delete(label);
                  else n.add(label);
                  return n;
                })
              }
              remindAll={groupBy === "person" && label !== "Unassigned" ? () => remindAllFor(items) : undefined}
            />
          )}
          {!collapsed.has(label) && (
            <ul className="mt-2 space-y-2">
              {items.map((e) => (
                <TaskCard key={e.r.code} e={e} selectMode={selectMode} />
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="mt-3 text-center text-[10px] text-fg-subtle">worst first · tap to open · swipe left to remind</p>
    </div>
  );
}

/* -------------------------------- Focus queue -------------------------------- */

const PRIO_WEIGHT: Record<string, number> = { Critical: 30, High: 15, Medium: 5, Low: 0 };

function score(e: Enriched): number {
  return (e.late ?? 0) * 2 + Math.min(e.quiet ?? 0, 30) * 3 + (PRIO_WEIGHT[e.r.priority] ?? 0);
}

/** The 5-minute morning ritual: ORI ranks the chase (deterministic, AI-off safe);
 *  one big card, four decisions + Skip; a cleared-today counter for momentum. */
export function FocusQueue({ rows }: { rows: TaskRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const nowMs = Date.now();
  const ranked = useMemo(
    () =>
      rows
        .map((r) => enrich(r, nowMs))
        .filter((e) => e.late !== null || (e.quiet !== null && e.quiet >= 7) || (e.dueIn !== null && e.dueIn <= 3))
        .sort((a, b) => score(b) - score(a)),
    [rows, nowMs],
  );

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [clearedCodes, setClearedCodes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [redating, setRedating] = useState(false);
  const [newDate, setNewDate] = useState("");

  const queue = ranked.filter((e) => !clearedCodes.has(e.r.code));
  const active = [...queue.filter((e) => !skipped.has(e.r.code)), ...queue.filter((e) => skipped.has(e.r.code))];
  const top = active[0];

  function clearTop(code: string) {
    setClearedCodes((s) => new Set(s).add(code));
    setRedating(false);
    setNewDate("");
    setShowWhy(false);
  }

  function decide(kind: "remind" | "escalate" | "done" | "redate") {
    if (!top) return;
    const { r } = top;
    setBusy(kind);
    start(async () => {
      if (kind === "remind") {
        const res = await adminRemindTask(r.id);
        setBusy(null);
        if (!res.ok) return toast(res.error, { tone: "warn" });
        if (res.link) window.open(res.link, "_blank");
        toast(`Reminder ready for ${res.name}.`, { tone: "success" });
        clearTop(r.code);
        return;
      }
      if (kind === "escalate") {
        const res = await inlineUpdateTask(r.code, "status", "Escalated");
        setBusy(null);
        if (!res.ok) return toast(res.error ?? "Could not escalate.", { tone: "warn" });
        toast(`${r.code} escalated.`, { tone: "success" });
        clearTop(r.code);
        router.refresh();
        return;
      }
      if (kind === "redate") {
        if (!newDate) {
          setBusy(null);
          return;
        }
        const res = await inlineUpdateTask(r.code, "deadline", newDate);
        setBusy(null);
        if (!res.ok) return toast(res.error ?? "Could not re-date.", { tone: "warn" });
        toast(`${r.code} re-dated to ${newDate}.`, { tone: "success" });
        clearTop(r.code);
        router.refresh();
        return;
      }
      // done
      const res = await inlineUpdateTask(r.code, "status", "Completed");
      setBusy(null);
      if (!res.ok) return toast(res.error ?? "Could not complete.", { tone: "warn" });
      toast(`${r.code} completed.`, { tone: "success" });
      clearTop(r.code);
      router.refresh();
    });
  }

  if (ranked.length === 0) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <p className="text-sm font-medium text-fg">Queue clear — nothing needs chasing.</p>
        <p className="mt-1 text-xs text-fg-muted">Overdue, quiet (7d+) and due-soon tasks land here each morning.</p>
      </div>
    );
  }

  const clearedToday = clearedCodes.size;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">Focus queue · ranked</p>
        {clearedToday > 0 && (
          <span className="rounded-full bg-success-soft/60 px-2 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/20">
            cleared: {clearedToday}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowWhy((s) => !s)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-soft/60 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20"
        >
          <HelpCircle size={11} /> Why this order?
        </button>
      </div>

      {showWhy && (
        <div className="rounded-2xl bg-bg-elev/60 p-3 text-[11px] leading-relaxed text-fg-muted ring-1 ring-border/70">
          <b className="text-fg">score = days late × 2 + quiet days × 3 (capped 30) + priority (Critical 30 · High 15 · Medium 5).</b>{" "}
          {top && (
            <>
              Top task {top.r.code}: {top.late ?? 0}×2 + {Math.min(top.quiet ?? 0, 30)}×3 + {PRIO_WEIGHT[top.r.priority] ?? 0} ={" "}
              <b className="text-fg">{score(top)}</b>. Deterministic — no black box.
            </>
          )}
        </div>
      )}

      {top ? (
        <div className="rounded-3xl bg-gradient-to-br from-bg-elev to-danger-soft/20 p-4 ring-1 ring-danger/20 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 rounded-md bg-bg-subtle px-2 py-0.5 text-[11px] font-semibold tabular text-fg-muted ring-1 ring-border/60">
              {top.r.code}
            </span>
            <Link
              href={`/?tab=tasks&task=${encodeURIComponent(top.r.code)}`}
              className="min-w-0 flex-1 truncate text-base font-semibold text-fg hover:text-accent sm:text-lg"
            >
              {top.r.actionItem}
            </Link>
            {top.late !== null && (
              <span className="shrink-0 rounded-full bg-danger-soft/70 px-2.5 py-1 text-xs font-bold tabular text-danger ring-1 ring-danger/25">
                {top.late}d late
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            {top.r.companyName}
            {top.r.assignees.length > 0 && <> · {top.r.assignees.join(", ")}</>} · {top.r.status} · {top.r.priority}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-danger">
            <AlertOctagon size={12} className="shrink-0" />
            {top.quiet === null
              ? "Never updated"
              : top.quiet >= 7
                ? `No update in ${top.quiet} days`
                : `Last update ${top.quiet === 0 ? "today" : `${top.quiet}d ago`}`}
            {top.dueIn !== null && top.dueIn <= 3 && <> · due {top.dueIn === 0 ? "today" : `in ${top.dueIn}d`}</>}
          </p>

          {redating && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-lg border border-border bg-bg-elev px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => decide("redate")}
                disabled={!newDate || busy === "redate"}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Set new date
              </button>
              <button type="button" onClick={() => setRedating(false)} className="text-xs text-fg-muted hover:text-fg">
                Cancel
              </button>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => decide("remind")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              <BellRing size={13} /> Remind
            </button>
            <button
              type="button"
              onClick={() => decide("escalate")}
              disabled={busy !== null || top.r.status === "Escalated"}
              className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft/60 px-4 py-2 text-xs font-semibold text-danger ring-1 ring-danger/25 transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Zap size={13} /> Escalate
            </button>
            <button
              type="button"
              onClick={() => setRedating((s) => !s)}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev px-4 py-2 text-xs font-semibold text-fg ring-1 ring-border transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Calendar size={13} /> Re-date
            </button>
            <button
              type="button"
              onClick={() => decide("done")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-success-soft/60 px-4 py-2 text-xs font-semibold text-success ring-1 ring-success/25 transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Check size={13} /> Done
            </button>
            <button
              type="button"
              onClick={() => top && setSkipped((s) => new Set(s).add(top.r.code))}
              disabled={busy !== null || active.length < 2}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Skip <SkipForward size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl glass p-8 text-center">
          <p className="text-sm font-medium text-success">Queue cleared — {clearedToday} handled. 🎯</p>
        </div>
      )}

      {active.length > 1 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Up next · {active.length - 1} more to clear
          </p>
          <ul className="space-y-1.5">
            {active.slice(1, 6).map((e, i) => (
              <li key={e.r.code} style={{ opacity: 1 - i * 0.12 }}>
                <Link
                  href={`/?tab=tasks&task=${encodeURIComponent(e.r.code)}`}
                  className="flex items-center gap-2.5 rounded-xl bg-bg-elev/50 px-3 py-2 ring-1 ring-border/60 transition-all hover:ring-accent/30"
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", e.late !== null ? "bg-danger" : "bg-warn")} />
                  <span className="shrink-0 text-[10px] font-semibold tabular text-fg-muted">{e.r.code}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{e.r.actionItem}</span>
                  <span className="shrink-0 text-[10px] text-fg-subtle">
                    {e.late !== null ? `${e.late}d late` : e.dueIn !== null && e.dueIn <= 3 ? (e.dueIn === 0 ? "due today" : `in ${e.dueIn}d`) : ""}
                    {e.quiet !== null && e.quiet >= 7 ? ` · quiet ${e.quiet}d` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
