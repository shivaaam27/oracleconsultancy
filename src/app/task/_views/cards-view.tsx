"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowUpRight,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  HelpCircle,
  MessageSquareDashed,
  MessageSquarePlus,
  Rows2,
  Rows3,
  SkipForward,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { CompanyAvatar } from "@/components/company-avatar";
import { AssigneeAvatars } from "@/components/assignee-avatars";
import { TaskInlineStatus } from "@/components/task-inline-edit";
import { DeadlineEditor } from "@/components/deadline-editor";
import { CodeLinkedText } from "@/components/code-linked-text";
import { getInitials } from "@/lib/names";
import type { TaskRow } from "@/lib/queries";
import { adminRemindTask, inlineUpdateTask } from "@/app/task/actions";
import { SelectCheckbox, OrderRegistrar } from "./selection";

/* Cards view — the merged Tasks view (Command Centre unification, round 2).
 * ONE view with a Comfortable | Compact density toggle. Both skins share:
 *   • an ALIGNED grid (dot · code · title · Status · Due · Activity · Who ·
 *     actions) so every control lines up in a rail down the page;
 *   • the same live controls the table/portal use — status dropdown, an
 *     EDITABLE deadline button, accountable avatar circles — in rounded-
 *     rectangle, roomy buttons with outline (lucide) icons only;
 *   • quiet/fresh read-only rail, a bare centred expand chevron, swipe-remind.
 * Comfortable rows expand in place to reveal description + latest updates +
 * quick actions; Compact stays one line (tap opens the drawer). */

const DAY = 86_400_000;
const DENSITY_KEY = "cos-tasks-density";
type Density = "comfortable" | "compact";

const PRIORITY_DOT: Record<string, string> = {
  Critical: "bg-danger",
  High: "bg-warn",
  Medium: "bg-accent",
  Low: "bg-border",
};

export type CompanyMeta = Record<string, { logoUrl: string | null; accent: string | null }>;

type Enriched = {
  r: TaskRow;
  late: number | null;
  dueIn: number | null;
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

/** quiet ≥7d → amber "Nd"; updated <2d ago → green "fresh". Outline icons only. */
function activityBadge(e: Enriched): { icon: React.ReactNode; label: string; tone: "warn" | "ok" } | null {
  const open = e.r.status !== "Completed" && e.r.status !== "Closed";
  if (!open) return null;
  if (e.quiet !== null && e.quiet >= 7) return { icon: <MessageSquareDashed size={12} />, label: `${e.quiet}d`, tone: "warn" };
  if (e.quiet !== null && e.quiet < 2) return { icon: <Check size={12} strokeWidth={2.6} />, label: "fresh", tone: "ok" };
  return null;
}

/* ------------------------- Expanded update preview --------------------------- */

type DetailUpdate = { id: number; body: string; created_at: string; created_by: string | null };

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Loaded on demand when a Comfortable row is expanded — description +
 *  the two latest updates + quick actions. The latest update renders INSTANTLY
 *  from data already in memory (TaskRow.latestActivity); a light background
 *  fetch then fills in the 2nd (and refreshes the first) — so there's no
 *  blocking "Loading…" spinner. */
function ExpandPanel({ r, onChanged }: { r: TaskRow; onChanged: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  // Seed with the latest update we already have, so it shows with zero wait.
  const seed: DetailUpdate[] = r.latestActivity
    ? [{ id: r.latestActivity.id, body: r.latestActivity.body, created_at: r.latestActivity.atISO, created_by: r.latestActivity.author }]
    : [];
  const [updates, setUpdates] = useState<DetailUpdate[]>(seed);

  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch the fuller list when there's likely more than the one we have.
    if (r.updateCount <= 1) return;
    let live = true;
    fetch(`/api/task-detail?code=${encodeURIComponent(r.code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!live || !d) return;
        const list = (d.updates as DetailUpdate[]) ?? [];
        if (list.length) setUpdates([...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 2));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [r.code, r.updateCount]);

  function act(kind: "escalate" | "done") {
    setBusy(kind);
    start(async () => {
      const res = await inlineUpdateTask(r.code, "status", kind === "escalate" ? "Escalated" : "Completed");
      setBusy(null);
      if (!res.ok) return toast(res.error ?? "Could not update.", { tone: "warn" });
      toast(`${r.code} ${kind === "escalate" ? "escalated" : "completed"}.`, { tone: "success" });
      onChanged();
      router.refresh();
    });
  }

  const chip = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/40 disabled:opacity-50";

  return (
    <div className="border-t border-dashed border-border/70 bg-bg-subtle/40 px-4 py-3">
      {r.comments?.trim() && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Description</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg whitespace-pre-wrap break-words">
            <CodeLinkedText text={r.comments} />
          </p>
        </>
      )}
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Latest updates</p>
      {updates.length === 0 ? (
        <p className="py-1.5 text-xs text-fg-subtle">No updates yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {updates.map((u) => (
            <li key={u.id} className="rounded-xl border border-border/60 bg-bg-elev px-3 py-2">
              <p className="text-[10.5px] text-fg-subtle">{u.created_by ?? "—"} · {ago(u.created_at)}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg whitespace-pre-wrap break-words"><CodeLinkedText text={u.body} /></p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Link href={`/?tab=tasks&task=${encodeURIComponent(r.code)}&dtab=conversation`} className={cn(chip, "text-accent")}>
          <MessageSquarePlus size={13} /> Add update
        </Link>
        {r.status !== "Escalated" && (
          <button type="button" onClick={() => act("escalate")} disabled={busy !== null} className={cn(chip, "text-danger")}>
            <Zap size={13} /> Escalate
          </button>
        )}
        <button type="button" onClick={() => act("done")} disabled={busy !== null} className={cn(chip, "text-success")}>
          <Check size={13} /> Done
        </button>
        <Link href={`/?tab=tasks&task=${encodeURIComponent(r.code)}`} className={cn(chip, "ml-auto")}>
          Open full task <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------- One task row -------------------------------- */

function TaskCard({
  e,
  density,
  selectMode,
  hideCompany,
  expanded,
  onToggleExpand,
  onChanged,
}: {
  e: Enriched;
  density: Density;
  selectMode: boolean;
  hideCompany: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onChanged: () => void;
}) {
  const { r } = e;
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const { swiped, offset, dragging, bind, reset } = useSwipeRow({ rightWidth: 92 });
  const compact = density === "compact";

  const act = activityBadge(e);

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

  // --- Shared cell elements (placed into the aligned grid). Status + date use
  //     FIXED widths so every control is the same length down the column. ---
  const statusCell = (
    <TaskInlineStatus
      task={r}
      buttonClassName="w-[150px] justify-between rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-[11px] font-medium hover:border-accent/40"
    />
  );
  const dueCell = (
    <DeadlineEditor
      code={r.code}
      deadline={r.deadline ? new Date(r.deadline) : null}
      daysToDeadline={r.daysToDeadline}
      className="w-[116px] mx-0 rounded-lg border border-border bg-bg-elev px-3 py-1.5 hover:border-accent/40"
    />
  );
  const activityCell = act ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1",
        act.tone === "warn" ? "bg-warn-soft/50 text-warn ring-warn/25" : "bg-success-soft/50 text-success ring-success/20",
      )}
    >
      {act.icon} {act.label}
    </span>
  ) : (
    <span className="text-fg-subtle/50" aria-hidden>·</span>
  );
  const whoCell = r.assignees.length > 0 ? (
    <AssigneeAvatars names={r.assignees} ids={r.assigneeIds} max={3} size={compact ? 20 : 24} />
  ) : (
    <span className="text-[11px] text-fg-subtle">—</span>
  );
  const remindBtn = (
    <button
      type="button"
      onClick={remind}
      disabled={busy === "remind"}
      title="Remind (their preferred channel)"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-elev text-fg-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
    >
      <Bell size={14} />
    </button>
  );
  // Bare, centred chevron (no button box) — comfortable only; compact taps open.
  const expandChevron = (
    <button
      type="button"
      onClick={onToggleExpand}
      aria-label={expanded ? "Collapse" : "Expand"}
      aria-expanded={expanded}
      className="inline-flex h-8 w-6 items-center justify-center text-fg-subtle transition-colors hover:text-accent"
    >
      <ChevronDown size={16} className={cn("transition-transform", expanded && "rotate-180")} />
    </button>
  );
  const openBtn = (
    <Link
      href={`/?tab=tasks&task=${encodeURIComponent(r.code)}`}
      title="Open task"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-elev text-fg-muted transition-colors hover:border-accent/40 hover:text-accent"
    >
      <MessageSquarePlus size={14} />
    </Link>
  );

  const titleLink = (
    <Link
      href={`/?tab=tasks&task=${encodeURIComponent(r.code)}`}
      onClick={(ev) => {
        if (swiped) {
          ev.preventDefault();
          reset();
        }
      }}
      className="min-w-0 truncate text-sm font-medium text-fg hover:text-accent"
    >
      {r.actionItem}
    </Link>
  );

  const swipeActive = offset !== 0 || swiped;
  return (
    // Clip ONLY while a swipe is in progress — otherwise overflow-hidden would
    // crop the deadline popover / status menu that pop above the row.
    <li className={cn("relative rounded-xl", swipeActive && "overflow-hidden")}>
      {/* Swipe tray (mobile) — hidden until the gesture starts. */}
      <div className={cn("absolute inset-y-0 right-0 flex w-[92px] items-stretch", offset === 0 && !swiped && "hidden")}>
        <button
          type="button"
          onClick={remind}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl bg-warn-soft/70 text-[11px] font-semibold text-warn"
        >
          <Bell size={15} /> Remind
        </button>
      </div>

      <div
        {...bind}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)" }}
        className="relative touch-pan-y"
      >
        <div className={cn("bg-bg-elev ring-1 transition-all", expanded ? "rounded-xl ring-accent/30" : "rounded-xl ring-border/60 hover:ring-accent/25")}>
          {/* Aligned grid: 3 cols on mobile (dot·code·title) with the controls
              wrapping onto row 2; on sm+ the controls wrapper is `contents`, so
              Status·Due·Activity·Who·Actions flow into fixed grid columns and
              line up in rails down the page. */}
          <div
            className={cn(
              "grid items-center gap-x-2.5 gap-y-1.5 px-3",
              compact ? "py-1.5" : "py-2.5",
              "grid-cols-[14px_54px_minmax(0,1fr)]",
              "sm:grid-cols-[14px_58px_minmax(0,1fr)_150px_116px_64px_78px_88px]",
            )}
          >
            {/* col 1 — priority dot (+ select) */}
            <span className="flex items-center gap-1.5">
              {selectMode && <SelectCheckbox code={r.code} />}
              <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[r.priority] ?? "bg-border")} title={`${r.priority} priority`} />
            </span>
            {/* col 2 — code */}
            <span className="truncate rounded-md bg-bg-subtle px-1.5 py-0.5 text-center text-[10px] font-semibold tabular text-fg-muted ring-1 ring-border/60">
              {r.code}
            </span>
            {/* col 3 — title (+ meta line in comfortable) */}
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                {titleLink}
                {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="New activity" />}
              </div>
              {!compact && (
                <span className="mt-0.5 truncate text-[11px] text-fg-subtle">
                  {[hideCompany ? null : r.companyName].filter(Boolean).join("")}
                  {act?.tone === "ok" && r.latestUpdate && <span className="text-success">{hideCompany ? "" : " · "}“{r.latestUpdate}”</span>}
                </span>
              )}
            </div>

            {/* controls — flex-wrap on mobile (row 2), grid cells on sm+ */}
            <div className="col-span-3 mt-1 flex flex-wrap items-center gap-1.5 pl-[26px] sm:col-span-1 sm:mt-0 sm:contents sm:pl-0">
              <span className="min-w-0">{statusCell}</span>
              <span className="min-w-0">{dueCell}</span>
              <span className="sm:justify-self-center">{activityCell}</span>
              <span className="sm:justify-self-center">{whoCell}</span>
              <span className="flex items-center justify-end gap-1">
                {remindBtn}
                {compact ? openBtn : expandChevron}
              </span>
            </div>
          </div>

          {expanded && !compact && <ExpandPanel r={r} onChanged={onChanged} />}
        </div>
      </div>
    </li>
  );
}

/* ------------------------------ Housed groups -------------------------------- */

export type CardsGroupBy = "company" | "status" | "person" | null;

function groupKey(r: TaskRow, g: CardsGroupBy): string {
  if (g === "status") return r.status;
  if (g === "person") return r.assignees[0] ?? "Unassigned";
  return r.companyName || "No company";
}

function GroupHousing({
  label,
  groupBy,
  items,
  collapsed,
  onToggle,
  density,
  selectMode,
  companyMeta,
  expandedCode,
  onToggleExpand,
  onChanged,
  remindAll,
}: {
  label: string;
  groupBy: CardsGroupBy;
  items: Enriched[];
  collapsed: boolean;
  onToggle: () => void;
  density: Density;
  selectMode: boolean;
  companyMeta: CompanyMeta;
  expandedCode: string | null;
  onToggleExpand: (code: string) => void;
  onChanged: () => void;
  remindAll?: () => void;
}) {
  const overdue = items.filter((e) => e.late !== null).length;
  const quiet = items.filter((e) => activityBadge(e)?.tone === "warn").length;
  const meta = companyMeta[label];

  return (
    <section className="overflow-hidden rounded-2xl bg-bg-elev/40 ring-1 ring-border/60">
      <div className={cn("flex w-full items-center gap-2.5 bg-bg-subtle/60 px-3.5 py-2.5", !collapsed && "border-b border-border/60")}>
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", collapsed && "-rotate-90")} />
          {groupBy === "company" ? (
            <CompanyAvatar name={label} accent={meta?.accent} logoUrl={meta?.logoUrl ?? null} size={24} rounded="rounded-lg" iconSize={12} />
          ) : groupBy === "person" && label !== "Unassigned" ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent ring-1 ring-accent/25">
              {getInitials(label)}
            </span>
          ) : null}
          <span className="truncate text-[12.5px] font-semibold text-fg">{label}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2.5 text-[10.5px] text-fg-muted">
          {overdue > 0 ? (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-danger" /><b className="font-bold text-danger tabular">{overdue}</b> overdue</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-success"><Check size={11} strokeWidth={3} /> on track</span>
          )}
          {quiet > 0 && (
            <span className="hidden items-center gap-1 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-warn" /><b className="font-bold text-warn tabular">{quiet}</b> quiet</span>
          )}
          <span className="text-fg-subtle">{items.length} task{items.length === 1 ? "" : "s"}</span>
        </span>
        {remindAll && overdue > 0 && (
          <button
            type="button"
            onClick={remindAll}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent-soft/70 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20 transition-all hover:-translate-y-0.5"
          >
            <Bell size={11} /> Remind all
          </button>
        )}
      </div>
      {!collapsed && (
        // Cap the housing at ~5 rows; the rest scroll within (portal section
        // pattern — soft fade edges + slim scrollbar).
        <div className={cn(items.length > 5 && "scroll-fade-y overflow-y-auto overscroll-contain slim-scroll", items.length > 5 && (density === "compact" ? "max-h-[15rem]" : "max-h-[23rem]"))}>
          <ul className="space-y-1.5 p-2">
            {items.map((e) => (
              <TaskCard
                key={e.r.code}
                e={e}
                density={density}
                selectMode={selectMode}
                hideCompany={groupBy === "company"}
                expanded={expandedCode === e.r.code}
                onToggleExpand={() => onToggleExpand(e.r.code)}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export type SortMode = "recent" | "overdue" | "duesoon" | "quiet" | "done";

function comparator(mode: SortMode): (a: Enriched, b: Enriched) => number {
  switch (mode) {
    case "overdue":
      return (a, b) => (b.late ?? -1) - (a.late ?? -1) || (b.quiet ?? -1) - (a.quiet ?? -1);
    case "duesoon":
      return (a, b) => (a.dueIn ?? 1e9) - (b.dueIn ?? 1e9);
    case "quiet":
      return (a, b) => (b.quiet ?? -1) - (a.quiet ?? -1);
    case "done":
      return (a, b) => +(b.r.closedDate ?? 0) - +(a.r.closedDate ?? 0);
    default: // "recent" — most recently touched first (updated, else created).
      return (a, b) =>
        +(b.r.lastUpdatedAt ?? b.r.createdDate ?? 0) - +(a.r.lastUpdatedAt ?? a.r.createdDate ?? 0);
  }
}

export function CardsView({
  rows,
  groupBy,
  companyMeta = {},
  sortMode = "recent",
  allCompanies,
}: {
  rows: TaskRow[];
  groupBy: CardsGroupBy;
  companyMeta?: CompanyMeta;
  sortMode?: SortMode;
  /** When grouping by company, every company name so empty ones still list. */
  allCompanies?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const nowMs = Date.now();

  // Persist the density choice per browser.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem(DENSITY_KEY) as Density | null) : null;
    if (saved === "comfortable" || saved === "compact") setDensity(saved);
  }, []);
  function setDensityPersist(d: Density) {
    setDensity(d);
    setExpandedCode(null);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* ignore */
    }
  }

  const enriched = useMemo(() => rows.map((r) => enrich(r, nowMs)), [rows, nowMs]);
  const sorted = useMemo(() => [...enriched].sort(comparator(sortMode)), [enriched, sortMode]);

  const groups = useMemo(() => {
    if (!groupBy) return [["", sorted] as const];
    const m = new Map<string, Enriched[]>();
    for (const e of sorted) {
      const k = groupKey(e.r, groupBy);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    // When grouping by company, list EVERY company even with no matching tasks.
    if (groupBy === "company" && allCompanies) {
      for (const name of allCompanies) if (!m.has(name)) m.set(name, []);
    }
    // Companies with overdue first, then any tasks, then empty ones last.
    return [...m.entries()].sort(
      (a, b) =>
        b[1].filter((e) => e.late !== null).length - a[1].filter((e) => e.late !== null).length ||
        (b[1].length > 0 ? 1 : 0) - (a[1].length > 0 ? 1 : 0) ||
        b[1].length - a[1].length ||
        a[0].localeCompare(b[0]),
    );
  }, [sorted, groupBy, allCompanies]);

  // Empty company housings start collapsed so they don't push real work down.
  const [seededCollapse, setSeededCollapse] = useState(false);
  useEffect(() => {
    if (seededCollapse || !allCompanies) return;
    const empties = groups.filter(([, items]) => items.length === 0).map(([label]) => label);
    if (empties.length) setCollapsed((s) => new Set([...s, ...empties]));
    setSeededCollapse(true);
  }, [groups, allCompanies, seededCollapse]);

  function toggleExpand(code: string) {
    setExpandedCode((c) => (c === code ? null : code));
  }
  function onChanged() {
    setExpandedCode(null);
  }

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
      <div className="mb-2 flex items-center gap-2">
        {/* Comfortable | Compact density toggle. */}
        <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60">
          {([
            { key: "comfortable" as const, label: "Comfortable", Icon: Rows2 },
            { key: "compact" as const, label: "Compact", Icon: Rows3 },
          ]).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDensityPersist(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                density === key ? "bg-bg-elev text-accent shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setSelectMode((s) => !s)}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors",
            selectMode ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle/60 text-fg-muted ring-border/60 hover:text-fg",
          )}
        >
          <Check size={12} /> {selectMode ? "Done selecting" : "Select"}
        </button>
      </div>

      {groupBy ? (
        <div className="space-y-3">
          {groups.map(([label, items]) => (
            <GroupHousing
              key={label}
              label={label}
              groupBy={groupBy}
              items={items}
              collapsed={collapsed.has(label)}
              density={density}
              selectMode={selectMode}
              companyMeta={companyMeta}
              expandedCode={expandedCode}
              onToggleExpand={toggleExpand}
              onChanged={onChanged}
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
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {groups[0][1].map((e) => (
            <TaskCard
              key={e.r.code}
              e={e}
              density={density}
              selectMode={selectMode}
              hideCompany={false}
              expanded={expandedCode === e.r.code}
              onToggleExpand={() => toggleExpand(e.r.code)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-center text-[10px] text-fg-subtle">worst first · tap a title to open · swipe left to remind</p>
    </div>
  );
}

/* -------------------------------- Focus queue -------------------------------- */

const PRIO_WEIGHT: Record<string, number> = { Critical: 30, High: 15, Medium: 5, Low: 0 };

function score(e: Enriched): number {
  return (e.late ?? 0) * 2 + Math.min(e.quiet ?? 0, 30) * 3 + (PRIO_WEIGHT[e.r.priority] ?? 0);
}

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
              <button type="button" onClick={() => decide("redate")} disabled={!newDate || busy === "redate"} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                Set new date
              </button>
              <button type="button" onClick={() => setRedating(false)} className="text-xs text-fg-muted hover:text-fg">Cancel</button>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => decide("remind")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50">
              <Bell size={13} /> Remind
            </button>
            <button type="button" onClick={() => decide("escalate")} disabled={busy !== null || top.r.status === "Escalated"} className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft/60 px-4 py-2 text-xs font-semibold text-danger ring-1 ring-danger/25 transition-all hover:-translate-y-0.5 disabled:opacity-50">
              <Zap size={13} /> Escalate
            </button>
            <button type="button" onClick={() => setRedating((s) => !s)} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elev px-4 py-2 text-xs font-semibold text-fg ring-1 ring-border transition-all hover:-translate-y-0.5 disabled:opacity-50">
              <Calendar size={13} /> Re-date
            </button>
            <button type="button" onClick={() => decide("done")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft/60 px-4 py-2 text-xs font-semibold text-success ring-1 ring-success/25 transition-all hover:-translate-y-0.5 disabled:opacity-50">
              <Check size={13} /> Done
            </button>
            <button type="button" onClick={() => top && setSkipped((s) => new Set(s).add(top.r.code))} disabled={busy !== null || active.length < 2} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-40">
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
