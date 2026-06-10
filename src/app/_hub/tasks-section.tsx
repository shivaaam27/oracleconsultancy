import { getAllTasks, getTaskSources, getRecentActivity } from "@/lib/queries";
import { getSavedViews } from "@/lib/task-views";
import { Card, EmptyState } from "@/components/ui";
import { TaskActions } from "./task-actions";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { TaskFilters } from "@/components/task-filters";
import { ViewPublisher } from "@/components/view-publisher";
import { ViewSwitcher, parseViewMode } from "@/app/task/_views/view-switcher";
import { BoardView } from "@/app/task/_views/board-view";
import { TableView } from "@/app/task/_views/table-view";
import { CalendarView } from "@/app/task/_views/calendar-view";
import { TimelineView } from "@/app/task/_views/timeline-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import Link from "next/link";
import { CheckSquare, Sparkles, Clock, Hourglass, PauseCircle, AlertOctagon, CalendarOff, Flame, UserMinus, X } from "lucide-react";
import { Hero } from "@/components/surface-kit";

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
  return u.toString();
}

export async function TasksSection({ sp }: { sp: Sp }) {
  // Hub Tasks tab is always global — no scope filtering. The scope cookie
  // applies to /task (standalone) but the hub shows all companies by design.
  const [all, savedViews, taskSources] = await Promise.all([
    getAllTasks(),
    getSavedViews(),
    getTaskSources(),
  ]);
  const view = parseViewMode(sp.view);
  // The global activity feed only needs loading for the Timeline view.
  const activity = view === "timeline" ? await getRecentActivity() : null;
  const taskMeta = view === "timeline"
    ? Object.fromEntries(all.map((r) => [r.id, { code: r.code, legacyCode: r.legacyCode, companyName: r.companyName, companyAccent: r.companyAccent, actionItem: r.actionItem }]))
    : {};
  const showClosed = sp.closed === "1";
  const statusOverridesClosed = sp.status === "Closed" || sp.status === "Completed";

  let rows = showClosed || statusOverridesClosed ? all : all.filter((r) => r.status !== "Closed");
  if (sp.company) rows = rows.filter((r) => r.companyName === sp.company);
  if (sp.priority) rows = rows.filter((r) => r.priority === sp.priority);
  if (sp.flag) rows = rows.filter((r) => r.flag === sp.flag);
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.noOwner === "1") rows = rows.filter((r) => r.assignees.length === 0);
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
  const priorities = ["Critical", "High", "Medium", "Low"];

  const baseForKpis = (showClosed ? all : all.filter((r) => r.status !== "Closed")).filter(
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
  };
  const closedCount = all.filter((r) => r.status === "Closed").length;

  const hasFilters = Boolean(sp.company || sp.priority || sp.flag || sp.status || sp.noOwner || sp.closed || sp.q);

  const dayMode = !hasFilters && sp.all !== "1" && view !== "calendar" && view !== "timeline";
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
    return u.toString();
  })();

  const resetHref = view === "table" ? "/?tab=tasks" : `/?tab=tasks&view=${view}`;

  const viewLabel = dayMode
    ? "needing attention"
    : (() => {
        const bits = [sp.flag, sp.priority, sp.status, sp.company, sp.noOwner === "1" ? "no owner" : null].filter(Boolean);
        return bits.length ? bits.join(" · ") : (showClosed ? "all tasks" : "open tasks");
      })();

  return (
    <div className="space-y-4">
      <TaskActions />
      <ViewPublisher codes={rows.map((r) => r.code)} label={viewLabel} />
      {/* Hero — shared surface-kit header, same language as Home */}
      <Hero
        title="Task Management"
        subtitle={
          dayMode
            ? `${total} item${total === 1 ? "" : "s"} need attention`
            : `${total} ${showClosed ? "task" : "open task"}${total === 1 ? "" : "s"}`
        }
        actions={<ViewSwitcher current={view} queryWithoutView={queryWithoutView(sp)} basePath="/" />}
      >
        <div className="space-y-3">
          {/* Focus / All toggle — segmented pill */}
          {!hasFilters && (view === "table" || view === "board") && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-bg-subtle/70 ring-1 ring-border/60 text-xs">
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
              {dayMode && (
                <span className="hidden sm:inline text-[11px] text-fg-muted">Overdue, due-soon, escalated &amp; critical across all companies.</span>
              )}
            </div>
          )}

          {/* KPI chips — one horizontal-scroll row on mobile, wraps on desktop */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {[
          { label: "Overdue",     count: kpi.overdue,     key: "overdue",     filterKey: "flag" as const,    tone: "danger" as const, Icon: Clock },
          { label: "Due Soon",    count: kpi.dueSoon,     key: "due-soon",    filterKey: "flag" as const,    tone: "warn" as const,   Icon: Hourglass },
          { label: "Stalled",     count: kpi.stalled,     key: "stalled",     filterKey: "flag" as const,    tone: "danger" as const, Icon: PauseCircle },
          { label: "Escalated",   count: kpi.escalated,   key: "escalated",   filterKey: "flag" as const,    tone: "danger" as const, Icon: AlertOctagon },
          { label: "No Deadline", count: kpi.noDeadline,  key: "no-deadline", filterKey: "flag" as const,    tone: "warn" as const,   Icon: CalendarOff },
          { label: "Critical",    count: kpi.critical,    key: "Critical",    filterKey: "priority" as const, tone: "danger" as const, Icon: Flame },
          { label: "No Owner",    count: kpi.noOwner,     key: "1",           filterKey: "noOwner" as const,  tone: "info" as const,   Icon: UserMinus },
        ].map(({ label, count, key, filterKey, tone, Icon }) => {
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
              className={`group shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm ${tint}`}
            >
              <Icon size={14} className="shrink-0" />
              <span className="font-medium whitespace-nowrap">{label}</span>
              <span className="font-semibold tabular">{count}</span>
              {active && <X size={12} className="shrink-0 opacity-70" />}
            </Link>
          );
        })}
          </div>
        </div>
      </Hero>

      {/* Filters bar — inline on desktop, collapses to a sheet on mobile */}
      <TaskFilters
        view={view}
        q={sp.q || ""}
        company={sp.company}
        priority={sp.priority}
        status={sp.status}
        flag={sp.flag}
        noOwner={sp.noOwner}
        closed={sp.closed}
        month={sp.month}
        companies={companyList}
        priorities={priorities}
        statuses={["Not Started","In Progress","Under Review","Waiting External","Blocked","Escalated","Completed","Closed"]}
        showClosed={showClosed}
        closedCount={closedCount}
        resetHref={resetHref}
        toggleClosedHref={buildHref(sp, { closed: showClosed ? undefined : "1" })}
        activeCount={[sp.company, sp.priority, sp.status, sp.q, sp.flag, sp.noOwner].filter(Boolean).length}
      />

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={currentQuery}
        hasFilters={hasFilters}
        basePath="/"
        extraQuery="tab=tasks"
      />

      {total === 0 && view !== "calendar" && view !== "timeline" ? (
        <Card className="p-8">
          <EmptyState
            icon={<CheckSquare size={32} />}
            title={hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={hasFilters ? "Try resetting or pick a different view." : "Create one above."}
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
          ) : (
            <TableView rows={rows} />
          )}
        </SelectionProvider>
      )}
    </div>
  );
}
