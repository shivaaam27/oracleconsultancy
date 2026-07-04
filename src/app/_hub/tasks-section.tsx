import { getAllTasks, getArchivedTasks, getTaskSources, getRecentActivity } from "@/lib/queries";
import { sb } from "@/db/supabase";
import { getSavedViews } from "@/lib/task-views";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { TaskActions } from "./task-actions";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { TaskToolbar } from "@/components/task-toolbar";
import { ViewPublisher } from "@/components/view-publisher";
import { ViewSwitcher, parseViewMode } from "@/app/task/_views/view-switcher";
import { BoardView } from "@/app/task/_views/board-view";
import { TableView } from "@/app/task/_views/table-view";
import { CardsView, FocusQueue } from "@/app/task/_views/cards-view";
import { CalendarView } from "@/app/task/_views/calendar-view";
import { TimelineView } from "@/app/task/_views/timeline-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import Link from "next/link";
import { CheckSquare, Sparkles, Hourglass, PauseCircle, AlertOctagon, CalendarOff, Flame, UserMinus, X, Archive } from "lucide-react";

type Sp = {
  company?: string;
  priority?: string;
  flag?: string;
  status?: string;
  noOwner?: string;
  closed?: string;
  view?: string;
  month?: string;
  q?: string;
  all?: string;
  unread?: string;
  group?: string;
  archived?: string;
  kind?: string; // "auto" = the renewals/admin lane (created_by "automation")
  /** Cards view: "focus" = the ranked Focus queue. */
  mode?: string;
  /** Cards view: "1" = the Done tab (Completed/Closed only). */
  done?: string;
  /** "1" = only tasks quiet 7+ days (no update). */
  quiet?: string;
};

/** Builds a hub URL for the tasks tab, preserving all task filter params. */
function buildHref(sp: Sp, overrides: Partial<Sp>): string {
  const next: Sp = { ...sp, ...overrides };
  const u = new URLSearchParams();
  u.set("tab", "tasks"); // always anchor to tasks tab
  if (next.company) u.set("company", next.company);
  if (next.priority) u.set("priority", next.priority);
  if (next.flag) u.set("flag", next.flag);
  if (next.status) u.set("status", next.status);
  if (next.noOwner) u.set("noOwner", next.noOwner);
  if (next.closed) u.set("closed", next.closed);
  if (next.view && next.view !== "table") u.set("view", next.view);
  if (next.month) u.set("month", next.month);
  if (next.q) u.set("q", next.q);
  if (next.all) u.set("all", next.all);
  if (next.unread) u.set("unread", next.unread);
  if (next.group) u.set("group", next.group);
  if (next.archived) u.set("archived", next.archived);
  if (next.kind) u.set("kind", next.kind);
  if (next.mode) u.set("mode", next.mode);
  if (next.done) u.set("done", next.done);
  if (next.quiet) u.set("quiet", next.quiet);
  return `/?${u.toString()}`;
}

/** Query string without the view/month keys — passed to ViewSwitcher. */
function queryWithoutView(sp: Sp): string {
  const u = new URLSearchParams();
  u.set("tab", "tasks");
  if (sp.company) u.set("company", sp.company);
  if (sp.priority) u.set("priority", sp.priority);
  if (sp.flag) u.set("flag", sp.flag);
  if (sp.status) u.set("status", sp.status);
  if (sp.noOwner) u.set("noOwner", sp.noOwner);
  if (sp.closed) u.set("closed", sp.closed);
  if (sp.q) u.set("q", sp.q);
  if (sp.all) u.set("all", sp.all);
  if (sp.archived) u.set("archived", sp.archived);
  if (sp.kind) u.set("kind", sp.kind);
  return u.toString();
}

export async function TasksSection({ sp }: { sp: Sp }) {
  // "Show archived" is an explicit opt-in: archived (soft-retired) tasks are
  // excluded from every default list/KPI (ACTTASKS-01), so this view loads the
  // archived set on its own from getArchivedTasks().
  const showArchived = sp.archived === "1";
  // Hub Tasks tab is always global — no scope filtering. The scope cookie
  // applies to /task (standalone) but the hub shows all companies by design.
  const [all, savedViews, taskSources, adminViews, peopleRows, autoEvents] = await Promise.all([
    showArchived ? getArchivedTasks() : getAllTasks(),
    getSavedViews(),
    getTaskSources(),
    sb.from("task_views").select("task_id,last_viewed_at").eq("viewer", "admin"),
    sb.from("people").select("name").eq("active", true).order("name"),
    // Which tasks the automation layer created (renewals / commitment notices) —
    // the marker for the separate lane. Tolerates the table not existing yet.
    sb.from("automation_events").select("target_id").eq("kind", "task-create").eq("target_table", "tasks"),
  ]);
  // Active people names for the quick-create assignee combobox suggestions.
  const peopleNames = [...new Set((peopleRows.data ?? []).map((p) => p.name as string).filter(Boolean))];

  // Unread = activity since the owner last opened the task (powered by the
  // Seen system). Marks tasks where someone posted and you haven't looked.
  const adminViewAt = new Map<number, number>();
  for (const v of adminViews.data ?? []) {
    adminViewAt.set(v.task_id as number, new Date(v.last_viewed_at as string).getTime());
  }
  for (const r of all) {
    const upd = r.lastUpdatedAt ? r.lastUpdatedAt.getTime() : 0;
    const seen = adminViewAt.get(r.id);
    // Unread = you've opened this task before AND there's been activity since
    // (i.e. someone posted after you last looked). Tasks never opened are not
    // flagged, so the system doesn't flood on first use.
    r.unread = seen !== undefined && upd > seen && r.status !== "Closed" && r.status !== "Completed";
  }
  // Separate machine-generated admin work (renewals / commitment notices, stamped
  // created_by "automation") from real, people-driven tasks. The default Task
  // Management view shows only "work"; the "Renewals & admin" lane shows only the
  // auto ones. They stay real tasks (codes, deadlines, links) — just in their own
  // lane, so the day-to-day list isn't flooded by the compliance machine.
  const isOpenRow = (r: (typeof all)[number]) => r.status !== "Completed" && r.status !== "Closed";
  const autoTaskIds = new Set((autoEvents.data ?? []).map((e) => e.target_id as number));
  const allAuto = all.filter((r) => autoTaskIds.has(r.id));
  const allWork = all.filter((r) => !autoTaskIds.has(r.id));
  const kindAuto = sp.kind === "auto";
  const autoOpenCount = allAuto.filter(isOpenRow).length;
  const workOpenCount = allWork.filter(isOpenRow).length;
  const base = kindAuto ? allAuto : allWork;

  const view = parseViewMode(sp.view);
  // The global activity feed only needs loading for the Timeline view.
  const activity = view === "timeline" ? await getRecentActivity() : null;
  const taskMeta = view === "timeline"
    ? Object.fromEntries(all.map((r) => [r.id, { code: r.code, legacyCode: r.legacyCode, companyName: r.companyName, companyAccent: r.companyAccent, actionItem: r.actionItem }]))
    : {};
  // Cards-view modes: "focus" = the ranked chase queue; done=1 = the Done tab
  // (Completed/Closed only — the cards view's closed-history home).
  const focusMode = sp.mode === "focus" && view === "cards" && !showArchived;
  const doneTab = sp.done === "1" && view === "cards";

  // In the archived view show every archived task regardless of status (many are
  // Closed/Completed); otherwise hide Closed unless explicitly opted in.
  const showClosed = sp.closed === "1" || showArchived || doneTab;
  const statusOverridesClosed = sp.status === "Closed" || sp.status === "Completed";

  let rows = showClosed || statusOverridesClosed ? base : base.filter((r) => r.status !== "Closed");
  if (doneTab) rows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");
  if (sp.company) rows = rows.filter((r) => r.companyName === sp.company);
  if (sp.priority) rows = rows.filter((r) => r.priority === sp.priority);
  if (sp.flag) rows = rows.filter((r) => r.flag === sp.flag);
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.noOwner === "1") rows = rows.filter((r) => r.assignees.length === 0);
  if (sp.unread === "1") rows = rows.filter((r) => r.unread);
  // Quiet 7d+ — open tasks nobody has touched in a week (or ever).
  const QUIET_MS = 7 * 86_400_000;
  const nowMsQ = Date.now();
  const isQuiet = (r: (typeof all)[number]) =>
    isOpenRow(r) && (!r.lastUpdatedAt || nowMsQ - r.lastUpdatedAt.getTime() >= QUIET_MS);
  if (sp.quiet === "1") rows = rows.filter(isQuiet);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.actionItem.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.assignees.some((a) => a.toLowerCase().includes(q))
    );
  }

  // Unique companies with ids — used by the jump-to-company picker.
  const companyList = [...new Map(all.map((r) => [r.companyId, r.companyName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Pre-select the actively-filtered company in quick-create (else first company).
  const quickDefaultCompanyId = sp.company
    ? companyList.find((c) => c.name === sp.company)?.id
    : undefined;
  const priorities = ["Critical", "High", "Medium", "Low"];

  const baseForKpis = (showClosed ? base : base.filter((r) => r.status !== "Closed")).filter(
    (r) => !sp.company || r.companyName === sp.company
  );
  const kpi = {
    overdue: baseForKpis.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
    dueSoon: baseForKpis.filter((r) => r.flag === "due-soon").length,
    stalled: baseForKpis.filter((r) => r.flag === "stalled").length,
    escalated: baseForKpis.filter((r) => r.flag === "escalated").length,
    noDeadline: baseForKpis.filter((r) => r.flag === "no-deadline").length,
    critical: baseForKpis.filter((r) => r.priority === "Critical").length,
    noOwner: baseForKpis.filter((r) => r.assignees.length === 0).length,
    unread: baseForKpis.filter((r) => r.unread).length,
    quiet: baseForKpis.filter(isQuiet).length,
  };
  const closedCount = base.filter((r) => r.status === "Closed").length;

  // Workload pulse metrics (respect the active company filter).
  const scoped = base.filter((r) => !sp.company || r.companyName === sp.company);
  const openScoped = scoped.filter((r) => r.status !== "Completed" && r.status !== "Closed");
  const onTrack = openScoped.filter(
    (r) => !["overdue", "escalate-now", "escalated", "stalled"].includes(r.flag) && r.status !== "Blocked" && r.status !== "Escalated"
  ).length;
  const onTrackPct = openScoped.length === 0 ? 100 : Math.round((onTrack / openScoped.length) * 100);
  const now = new Date();
  const completedThisMonth = scoped.filter(
    (r) => (r.status === "Completed" || r.status === "Closed") && r.closedDate &&
      r.closedDate.getMonth() === now.getMonth() && r.closedDate.getFullYear() === now.getFullYear()
  ).length;
  const needYou = kpi.overdue + kpi.escalated;

  const hasFilters = Boolean(sp.company || sp.priority || sp.flag || sp.status || sp.noOwner || sp.closed || sp.q || sp.unread || sp.quiet);

  // The old attention-trimmed "day mode" applies to the table only — the cards
  // view has its own Focus queue for that job and Browse shows everything.
  const dayMode =
    !hasFilters && !showArchived && sp.all !== "1" &&
    view !== "calendar" && view !== "timeline" && view !== "board" && view !== "cards";
  if (dayMode) {
    rows = rows.filter(
      (r) =>
        r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "due-soon" ||
        r.flag === "escalated" || r.status === "Escalated" ||
        (r.priority === "Critical" && r.status !== "Completed" && r.status !== "Closed")
    );
    rows.sort((a, b) => {
      const aDue = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return ["Critical", "High", "Medium", "Low"].indexOf(a.priority) - ["Critical", "High", "Medium", "Low"].indexOf(b.priority);
    });
  }

  // Group-by (table view only): sort rows by the group key so TableView can
  // emit section headers. Stable within a group by keeping the prior order.
  const groupBy = (["company", "status", "person"].includes(sp.group || "") ? sp.group : null) as
    | "company" | "status" | "person" | null;
  // Cards default to company grouping (the approved composition) unless the
  // owner picks another grouping — "none" is sp.group="" (falls to null? no:
  // empty string means unset → default company here).
  const cardsGroupBy = view === "cards" ? (sp.group === "none" ? null : (groupBy ?? "company")) : null;
  if (groupBy && view === "table") {
    const keyOf = (r: (typeof rows)[number]) =>
      groupBy === "company" ? r.companyName || "~"
      : groupBy === "status" ? r.status
      : r.assignees[0] || "~~Unassigned";
    rows = [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  }

  const total = rows.length;
  // For SavedViewsBar — strip the tab= prefix so saved views stay compatible
  const currentQuery = (() => {
    const u = new URLSearchParams();
    if (sp.company) u.set("company", sp.company);
    if (sp.priority) u.set("priority", sp.priority);
    if (sp.flag) u.set("flag", sp.flag);
    if (sp.status) u.set("status", sp.status);
    if (sp.noOwner) u.set("noOwner", sp.noOwner);
    if (sp.closed) u.set("closed", sp.closed);
    if (sp.view && sp.view !== "board") u.set("view", sp.view);
    if (sp.month) u.set("month", sp.month);
    if (sp.q) u.set("q", sp.q);
    if (sp.all) u.set("all", sp.all);
    if (sp.kind) u.set("kind", sp.kind);
    return u.toString();
  })();

  const viewLabel = showArchived
    ? "archived tasks"
    : dayMode
    ? "needing attention"
    : (() => {
        const bits = [sp.flag, sp.priority, sp.status, sp.company, sp.noOwner === "1" ? "no owner" : null].filter(Boolean);
        return bits.length ? bits.join(" · ") : (showClosed ? "all tasks" : "open tasks");
      })();

  return (
    <div className="space-y-4">
      <ViewPublisher codes={rows.map((r) => r.code)} label={viewLabel} />
      {/* Compact, table-first header — matches /people & /documents. The
          headline signals live in the sub-line + the chip rail below (which
          double as filters), so the table sits near the top of the page. */}
      <PageHeader
        title="Task management"
        sub={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span><span className="font-medium text-fg">{openScoped.length}</span> open</span>
            <span aria-hidden className="text-fg-subtle">·</span>
            <span className={needYou > 0 ? "text-danger" : ""}>
              <span className="font-medium">{needYou}</span> need{needYou === 1 ? "s" : ""} you
            </span>
            <span aria-hidden className="text-fg-subtle">·</span>
            <span><span className="font-medium text-fg">{onTrackPct}%</span> on track</span>
            <span aria-hidden className="text-fg-subtle">·</span>
            <span><span className="font-medium text-fg">{completedThisMonth}</span> done this month</span>
          </span>
        }
        action={<ViewSwitcher current={view} queryWithoutView={queryWithoutView(sp)} basePath="/" />}
      />

      {/* Lane switch — real, people-driven work vs the machine-generated
          renewals/admin lane (tasks created by automation). Keeps Task Management
          for real work; the compliance machine lives in its own tab. */}
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-bg-subtle/70 ring-1 ring-border/60 text-xs">
        <Link
          href={buildHref(sp, { kind: undefined, all: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${!kindAuto ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
        >
          <CheckSquare size={13} /> Work{workOpenCount > 0 && <span className="opacity-70">· {workOpenCount}</span>}
        </Link>
        <Link
          href={buildHref(sp, { kind: "auto", all: "1" })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${kindAuto ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
        >
          <Sparkles size={13} /> Renewals &amp; admin{autoOpenCount > 0 && <span className="opacity-70">· {autoOpenCount}</span>}
        </Link>
      </div>
      {kindAuto && (
        <p className="-mt-1 text-[11px] text-fg-subtle">
          Auto-created by the system from expiring documents &amp; commitments. Complete or undo them like any task.
        </p>
      )}

      {/* Controls — just two calm rows: the toolbar, then Focus/All · attention
          chips · group-by all on one wrapping line. Keeps the table the hero. */}
      <div className="space-y-3">
          {/* Toolbar — search · company · filters · show closed (consolidated). */}
          <TaskToolbar
            view={view}
            q={sp.q || ""}
            company={sp.company}
            priority={sp.priority}
            status={sp.status}
            showClosed={showClosed}
            closedCount={closedCount}
            companies={companyList}
            priorities={priorities}
            statuses={["Not Started", "In Progress", "Under Review", "Waiting External", "Blocked", "Escalated", "Completed", "Closed"]}
          />

          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {/* Cards view — the mode segment: Focus (ranked chase queue) ·
                Browse (everything) · Done (Completed/Closed history). */}
            {view === "cards" && !showArchived && (
              <div className="inline-flex shrink-0 items-center gap-1 p-1 rounded-full bg-bg-subtle/70 ring-1 ring-border/60 text-xs">
                <Link
                  href={buildHref(sp, { mode: "focus", done: undefined })}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${focusMode ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
                >
                  <Sparkles size={13} /> Focus
                </Link>
                <Link
                  href={buildHref(sp, { mode: undefined, done: undefined })}
                  className={`px-3 py-1.5 rounded-full transition-all ${!focusMode && !doneTab ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
                >
                  Browse
                </Link>
                <Link
                  href={buildHref(sp, { done: "1", mode: undefined })}
                  className={`px-3 py-1.5 rounded-full transition-all ${doneTab ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
                >
                  Done
                </Link>
              </div>
            )}
            {/* Focus / All — segmented pill */}
            {!hasFilters && (view === "table" || view === "board") && (
              <div className="inline-flex shrink-0 items-center gap-1 p-1 rounded-full bg-bg-subtle/70 ring-1 ring-border/60 text-xs">
                <Link
                  href="/?tab=tasks"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${dayMode ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
                >
                  <Sparkles size={13} /> Focus
                </Link>
                <Link
                  href="/?tab=tasks&all=1"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${!dayMode ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"}`}
                >
                  All tasks
                </Link>
              </div>
            )}

            {/* Show archived — opt-in toggle (archived tasks are hidden from every
                default list and KPI). A plain chip so it works in every view. */}
            <Link
              href={buildHref({}, { archived: showArchived ? undefined : "1" })}
              title={showArchived ? "Showing archived tasks — tap to return to live" : "Show archived tasks"}
              aria-pressed={showArchived}
              className={`group shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 text-xs rounded-full transition-all hover:shadow-sm ${
                showArchived
                  ? "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
                  : "bg-bg-subtle/50 ring-1 ring-border/60 text-fg-muted hover:text-fg hover:ring-2"
              }`}
            >
              <Archive size={14} className="shrink-0" />
              <span className="font-medium whitespace-nowrap">Archived</span>
              {showArchived && <X size={12} className="shrink-0 opacity-70" />}
            </Link>

            {/* Attention chips — only the ones that have tasks; each is also a filter. */}
            {([
              { label: "Overdue",     count: kpi.overdue,     key: "overdue",     filterKey: "flag" as const,    tone: "danger" as const, Icon: AlertOctagon },
              { label: "Escalated",   count: kpi.escalated,   key: "escalated",   filterKey: "flag" as const,    tone: "danger" as const, Icon: AlertOctagon },
              { label: "Unread",      count: kpi.unread,      key: "1",           filterKey: "unread" as const,  tone: "info" as const,   Icon: Sparkles },
              { label: "Quiet 7d+",   count: kpi.quiet,       key: "1",           filterKey: "quiet" as const,   tone: "warn" as const,   Icon: PauseCircle },
              { label: "Due Soon",    count: kpi.dueSoon,     key: "due-soon",    filterKey: "flag" as const,    tone: "warn" as const,   Icon: Hourglass },
              { label: "Stalled",     count: kpi.stalled,     key: "stalled",     filterKey: "flag" as const,    tone: "danger" as const, Icon: PauseCircle },
              { label: "No Deadline", count: kpi.noDeadline,  key: "no-deadline", filterKey: "flag" as const,    tone: "warn" as const,   Icon: CalendarOff },
              { label: "Critical",    count: kpi.critical,    key: "Critical",    filterKey: "priority" as const, tone: "danger" as const, Icon: Flame },
              { label: "No Owner",    count: kpi.noOwner,     key: "1",           filterKey: "noOwner" as const,  tone: "info" as const,   Icon: UserMinus },
            ]).filter((c) => c.count > 0 || sp[c.filterKey] === c.key).map(({ label, count, key, filterKey, tone, Icon }) => {
              const active = sp[filterKey] === key;
              const href = buildHref(sp, { [filterKey]: active ? undefined : key });
              const tint = active
                ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
                  : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
                  : "bg-info-soft/70 ring-2 ring-info/40 text-info"
                : count === 0
                  ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
                  : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
                  : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
                  : "bg-info-soft/50 ring-1 ring-info/25 text-info hover:ring-2";
              return (
                <Link
                  key={label}
                  href={href}
                  title={active ? `${label}: ${count} — tap to clear` : `${label}: ${count}`}
                  aria-label={`${label}: ${count}`}
                  aria-pressed={active}
                  className={`group shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 text-xs rounded-full transition-all hover:shadow-sm ${tint}`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="font-medium whitespace-nowrap">{label}</span>
                  <span className="font-semibold tabular">{count}</span>
                  {active && <X size={12} className="shrink-0 opacity-70" />}
                </Link>
              );
            })}

            {/* Group-by — pushed to the right (cards + table views; desktop).
                Cards default to Company, so "None" is an explicit group=none. */}
            {(view === "table" || view === "cards") && (
              <div className="ml-auto hidden shrink-0 items-center gap-2 text-xs sm:flex">
                <span className="text-fg-subtle">Group</span>
                <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-bg-subtle/70 ring-1 ring-border/60">
                  {([
                    { key: null, label: "None" },
                    { key: "company", label: "Company" },
                    { key: "status", label: "Status" },
                    { key: "person", label: "Person" },
                  ] as const).map((g) => {
                    const on = view === "cards" ? cardsGroupBy === g.key : (groupBy ?? null) === g.key;
                    const groupParam = g.key ?? (view === "cards" ? "none" : undefined);
                    return (
                      <Link
                        key={g.label}
                        href={buildHref(sp, { group: groupParam })}
                        className={`px-2.5 py-1 rounded-full transition-colors ${on ? "bg-accent text-accent-fg font-medium" : "text-fg-muted hover:text-fg"}`}
                      >
                        {g.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={currentQuery}
        hasFilters={hasFilters}
        basePath="/"
        extraQuery="tab=tasks"
      />

      {/* Quick-create host: registers the nav-pill `+` page action + renders the
          inline "Add a task…" row (list views only) and the QuickTaskPopover. */}
      <TaskActions
        companies={companyList}
        people={peopleNames}
        defaultCompanyId={quickDefaultCompanyId}
        showInline={view === "table" || view === "board" || view === "cards"}
      />

      {total === 0 && view !== "calendar" && view !== "timeline" && !focusMode ? (
        <Card className="p-8">
          <EmptyState
            icon={showArchived ? <Archive size={32} /> : <CheckSquare size={32} />}
            title={showArchived ? "No archived tasks." : doneTab ? "Nothing completed yet." : hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={showArchived ? "Archive a task to retire it without losing its history." : hasFilters ? "Try resetting or pick a different view." : "Create one above."}
          />
        </Card>
      ) : view === "calendar" ? (
        <CalendarView rows={rows} month={sp.month} queryWithoutMonth={queryWithoutView(sp)} />
      ) : view === "timeline" ? (
        <TimelineView rows={rows} sources={taskSources} activity={activity} taskMeta={taskMeta} />
      ) : (
        <SelectionProvider>
          <BulkBar />
          {view === "board" ? (
            <BoardView rows={rows} showClosed={showClosed} />
          ) : view === "cards" ? (
            focusMode ? (
              <FocusQueue rows={rows.filter(isOpenRow)} />
            ) : (
              <CardsView rows={rows} groupBy={cardsGroupBy} />
            )
          ) : (
            <TableView rows={rows} groupBy={view === "table" ? groupBy : null} hideCompany={view === "table" && groupBy === "company"} />
          )}
        </SelectionProvider>
      )}
    </div>
  );
}
