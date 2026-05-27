import { getAllTasks } from "@/lib/queries";
import { getSavedViews } from "@/lib/task-views";
import { Card, LinkButton, EmptyState } from "@/components/ui";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { ViewSwitcher, parseViewMode } from "@/app/task/_views/view-switcher";
import { BoardView } from "@/app/task/_views/board-view";
import { TableView } from "@/app/task/_views/table-view";
import { CalendarView } from "@/app/task/_views/calendar-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import Link from "next/link";
import { Plus, CheckSquare } from "lucide-react";

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
  if (next.view && next.view !== "board") u.set("view", next.view);
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
  const [all, savedViews] = await Promise.all([
    getAllTasks(),
    getSavedViews(),
  ]);
  const view = parseViewMode(sp.view);
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

  const companies = [...new Set(all.map((r) => r.companyName))].filter(Boolean).sort();
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

  const dayMode = !hasFilters && sp.all !== "1" && view !== "calendar";
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

  const resetHref = view === "board" ? "/?tab=tasks" : `/?tab=tasks&view=${view}`;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{dayMode ? "My Day" : "Tasks"}</h2>
          <p className="text-xs text-fg-muted mt-0.5">
            {dayMode
              ? `${total} item${total === 1 ? "" : "s"} needing attention`
              : `${total} ${showClosed ? "task" : "open task"}${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher current={view} queryWithoutView={queryWithoutView(sp)} basePath="/" />
          <LinkButton href="/task/new">
            <Plus size={14} /> New Task
          </LinkButton>
        </div>
      </div>

      {/* My Day banner */}
      {dayMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <div className="text-fg-muted">
            Focus mode — overdue, due-soon, escalated, and critical tasks across all companies.
          </div>
          <Link href="/?tab=tasks&all=1" className="text-accent hover:underline whitespace-nowrap">
            Show all tasks →
          </Link>
        </div>
      )}

      {/* KPI chips */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Overdue", count: kpi.overdue, key: "overdue", filterKey: "flag" as const, tone: "danger" as const },
            { label: "Due Soon", count: kpi.dueSoon, key: "due-soon", filterKey: "flag" as const, tone: "warn" as const },
            { label: "Stalled", count: kpi.stalled, key: "stalled", filterKey: "flag" as const, tone: "danger" as const },
            { label: "Escalated", count: kpi.escalated, key: "escalated", filterKey: "flag" as const, tone: "danger" as const },
            { label: "No Deadline", count: kpi.noDeadline, key: "no-deadline", filterKey: "flag" as const, tone: "warn" as const },
            { label: "Critical", count: kpi.critical, key: "Critical", filterKey: "priority" as const, tone: "danger" as const },
            { label: "No Owner", count: kpi.noOwner, key: "1", filterKey: "noOwner" as const, tone: "info" as const },
          ].map(({ label, count, key, filterKey, tone }) => {
            const active = sp[filterKey] === key;
            const href = buildHref(sp, { [filterKey]: active ? undefined : key });
            const toneClass = active
              ? tone === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40"
                : tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40"
              : count === 0 ? "border-transparent text-fg-subtle"
              : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted";
            return (
              <Link key={label} href={href} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${toneClass}`}>
                <span className="font-semibold tabular">{count}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Filters bar */}
      <Card className="p-3">
        <form className="flex flex-wrap gap-2 items-center">
          {/* Anchor to tasks tab */}
          <input type="hidden" name="tab" value="tasks" />
          {sp.flag && <input type="hidden" name="flag" value={sp.flag} />}
          {sp.noOwner && <input type="hidden" name="noOwner" value={sp.noOwner} />}
          {sp.closed && <input type="hidden" name="closed" value={sp.closed} />}
          {sp.view && sp.view !== "board" && <input type="hidden" name="view" value={sp.view} />}
          {sp.month && <input type="hidden" name="month" value={sp.month} />}

          {view === "table" && (
            <input
              name="q"
              defaultValue={sp.q || ""}
              placeholder="Search action item, code, or person…"
              className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-md"
            />
          )}
          <select name="company" defaultValue={sp.company || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select name="priority" defaultValue={sp.priority || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Priorities</option>
            {priorities.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select name="status" defaultValue={sp.status || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Statuses</option>
            {["Not Started","In Progress","Under Review","Waiting External","Blocked","Escalated","Completed","Closed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90">
            Apply
          </button>
          {hasFilters && (
            <Link href={resetHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
              Reset
            </Link>
          )}
          <Link
            href={buildHref(sp, { closed: showClosed ? undefined : "1" })}
            className={`px-2 py-1 rounded-md text-xs ${showClosed ? "bg-bg-muted text-fg" : "text-fg-muted hover:bg-bg-muted"}`}
          >
            {showClosed ? "✓ " : ""}Show closed ({closedCount})
          </Link>
        </form>
      </Card>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={currentQuery}
        hasFilters={hasFilters}
        basePath="/"
        extraQuery="tab=tasks"
      />

      {total === 0 && view !== "calendar" ? (
        <Card className="p-8">
          <EmptyState
            icon={<CheckSquare size={32} />}
            title={hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={hasFilters ? "Try resetting or pick a different view." : "Create one above."}
          />
        </Card>
      ) : view === "calendar" ? (
        <CalendarView rows={rows} month={sp.month} queryWithoutMonth={queryWithoutView(sp)} />
      ) : (
        <SelectionProvider>
          {view === "board" ? (
            <BoardView rows={rows} showClosed={showClosed} />
          ) : (
            <TableView rows={rows} />
          )}
          <BulkBar />
        </SelectionProvider>
      )}
    </div>
  );
}
