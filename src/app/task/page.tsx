import { getAllTasks } from "@/lib/queries";
import { getScopedCompanyId } from "@/lib/scope";
import { getSavedViews } from "@/lib/task-views";
import { PageHeader, Card, LinkButton, EmptyState } from "@/components/ui";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { ViewSwitcher, parseViewMode } from "./_views/view-switcher";
import { BoardView } from "./_views/board-view";
import { TableView } from "./_views/table-view";
import { CalendarView } from "./_views/calendar-view";
import { SelectionProvider, BulkBar } from "./_views/selection";
import Link from "next/link";
import { Plus, CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";

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
  /** "1" disables the default My Day filter when no other filters are set. */
  all?: string;
};

function buildQuery(sp: Sp): string {
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
}

function withQ(sp: Sp, overrides: Partial<Sp>): string {
  const merged = { ...sp, ...overrides };
  const q = buildQuery(merged);
  return q ? `/task?${q}` : "/task";
}

function queryWithoutKeys(sp: Sp, drop: (keyof Sp)[]): string {
  const next: Sp = { ...sp };
  for (const k of drop) delete next[k];
  return buildQuery(next);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const sp = await searchParams;
  const [allUnscoped, savedViews, scopedId] = await Promise.all([
    getAllTasks(),
    getSavedViews(),
    getScopedCompanyId(),
  ]);

  const all = scopedId != null ? allUnscoped.filter((r) => r.companyId === scopedId) : allUnscoped;
  const view = parseViewMode(sp.view);
  const showClosed = sp.closed === "1";

  // If status filter is set, infer showClosed so picking "Closed" actually shows them.
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

  const hasFilters = Boolean(
    sp.company || sp.priority || sp.flag || sp.status || sp.noOwner || sp.closed || sp.q
  );

  // "My Day" default: when no filters at all (and the user hasn't opted out
  // via ?all=1), narrow to the focus set — overdue, due-soon, escalated,
  // critical-open — sorted by deadline (overdue first, nulls last). Calendar
  // view shows the month grid as-is.
  const dayMode = !hasFilters && sp.all !== "1" && view !== "calendar";
  if (dayMode) {
    rows = rows.filter(
      (r) =>
        r.flag === "overdue" ||
        r.flag === "escalate-now" ||
        r.flag === "due-soon" ||
        r.flag === "escalated" ||
        r.status === "Escalated" ||
        (r.priority === "Critical" && r.status !== "Completed" && r.status !== "Closed")
    );
    rows.sort((a, b) => {
      const aDue = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const order = ["Critical", "High", "Medium", "Low"];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    });
  }

  const total = rows.length;
  const currentQuery = buildQuery(sp);

  return (
    <div className="space-y-4">
      <PageHeader
        title={dayMode ? "My Day" : "Tasks"}
        sub={
          dayMode
            ? `${total} item${total === 1 ? "" : "s"} needing attention today`
            : `${total} ${showClosed ? "task" : "open task"}${total === 1 ? "" : "s"}`
        }
        action={
          <div className="flex items-center gap-2">
            <ViewSwitcher current={view} queryWithoutView={queryWithoutKeys(sp, ["view", "month"])} />
            <LinkButton href="/task/new">
              <Plus size={14} /> New Task
            </LinkButton>
          </div>
        }
      />

      {dayMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <div className="text-fg-muted">
            Focus mode — overdue, due-soon, escalated, and critical open tasks across
            {scopedId != null ? " this company" : " all companies"}.
          </div>
          <Link href="/task?all=1" className="text-accent hover:underline whitespace-nowrap">
            Show all tasks →
          </Link>
        </div>
      )}

      {/* KPI strip */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <KpiChip label="Overdue" count={kpi.overdue} active={sp.flag === "overdue"} href={withQ(sp, { flag: sp.flag === "overdue" ? undefined : "overdue" })} tone="danger" />
          <KpiChip label="Due Soon" count={kpi.dueSoon} active={sp.flag === "due-soon"} href={withQ(sp, { flag: sp.flag === "due-soon" ? undefined : "due-soon" })} tone="warn" />
          <KpiChip label="Stalled" count={kpi.stalled} active={sp.flag === "stalled"} href={withQ(sp, { flag: sp.flag === "stalled" ? undefined : "stalled" })} tone="danger" />
          <KpiChip label="Escalated" count={kpi.escalated} active={sp.flag === "escalated"} href={withQ(sp, { flag: sp.flag === "escalated" ? undefined : "escalated" })} tone="danger" />
          <KpiChip label="No Deadline" count={kpi.noDeadline} active={sp.flag === "no-deadline"} href={withQ(sp, { flag: sp.flag === "no-deadline" ? undefined : "no-deadline" })} tone="warn" />
          <KpiChip label="Critical" count={kpi.critical} active={sp.priority === "Critical"} href={withQ(sp, { priority: sp.priority === "Critical" ? undefined : "Critical" })} tone="danger" />
          <KpiChip label="No Owner" count={kpi.noOwner} active={sp.noOwner === "1"} href={withQ(sp, { noOwner: sp.noOwner === "1" ? undefined : "1" })} tone="info" />
        </div>
      </Card>

      {/* Filters bar */}
      <Card className="p-3">
        <form className="flex flex-wrap gap-2 items-center">
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
            {companies.map((c) => (<option key={c}>{c}</option>))}
          </select>
          <select name="priority" defaultValue={sp.priority || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Priorities</option>
            {priorities.map((p) => (<option key={p}>{p}</option>))}
          </select>
          <select name="status" defaultValue={sp.status || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Statuses</option>
            {[
              "Not Started",
              "In Progress",
              "Under Review",
              "Waiting External",
              "Blocked",
              "Escalated",
              "Completed",
              "Closed",
            ].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90">
            Apply
          </button>
          {hasFilters && (
            <Link href={view === "board" ? "/task" : `/task?view=${view}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
              Reset
            </Link>
          )}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <Link
              href={withQ(sp, { closed: showClosed ? undefined : "1" })}
              className={`px-2 py-1 rounded-md ${showClosed ? "bg-bg-muted text-fg" : "hover:bg-bg-muted"}`}
            >
              {showClosed ? "✓ " : ""}Show closed ({closedCount})
            </Link>
          </label>
        </form>
      </Card>

      <SavedViewsBar initialViews={savedViews} currentQuery={currentQuery} hasFilters={hasFilters} />

      {total === 0 && view !== "calendar" ? (
        <Card className="p-8">
          <EmptyState
            icon={<CheckSquare size={32} />}
            title={hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={hasFilters ? "Try resetting or pick a different view." : "Create one with Quick Capture or via New Task."}
          />
        </Card>
      ) : view === "calendar" ? (
        <CalendarView
          rows={rows}
          month={sp.month}
          queryWithoutMonth={queryWithoutKeys(sp, ["view", "month"])}
        />
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

function KpiChip({
  label,
  count,
  active,
  href,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
  tone: "danger" | "warn" | "info";
}) {
  const toneClass = active
    ? tone === "danger"
      ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
        : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/40"
    : count === 0
      ? "border-transparent text-fg-subtle"
      : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${toneClass}`}
    >
      <span className="font-semibold tabular">{count}</span>
      <span>{label}</span>
    </Link>
  );
}

