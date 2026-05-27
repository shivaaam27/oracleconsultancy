import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { getSavedViews } from "@/lib/task-views";
import { PageHeader, Card, Badge, LinkButton, EmptyState } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { TaskHover } from "@/components/task-hover";
import { SavedViewsBar } from "@/components/saved-views-bar";
import Link from "next/link";
import { Plus, CheckSquare, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const BOARD_STATUSES = [
  "Not Started",
  "In Progress",
  "Under Review",
  "Waiting External",
  "Blocked",
  "Escalated",
  "Completed",
  "Closed",
] as const;

type Sp = {
  company?: string;
  priority?: string;
  flag?: string;
  noOwner?: string;
  closed?: string;
};

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  switch (f) {
    case "closed": return "default";
    case "escalated":
    case "escalate-now":
    case "overdue":
    case "stalled": return "danger";
    case "due-soon":
    case "no-deadline":
    case "aging": return "warn";
    case "on-track": return "success";
    default: return "default";
  }
}

function buildQuery(sp: Sp): string {
  const u = new URLSearchParams();
  if (sp.company) u.set("company", sp.company);
  if (sp.priority) u.set("priority", sp.priority);
  if (sp.flag) u.set("flag", sp.flag);
  if (sp.noOwner) u.set("noOwner", sp.noOwner);
  if (sp.closed) u.set("closed", sp.closed);
  return u.toString();
}

function withQ(sp: Sp, overrides: Partial<Sp>): string {
  const merged = { ...sp, ...overrides };
  const q = buildQuery(merged);
  return q ? `/task?${q}` : "/task";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const sp = await searchParams;
  const [all, savedViews] = await Promise.all([getAllTasks(), getSavedViews()]);

  const showClosed = sp.closed === "1";

  let rows = showClosed ? all : all.filter((r) => r.status !== "Closed");
  if (sp.company) rows = rows.filter((r) => r.companyName === sp.company);
  if (sp.priority) rows = rows.filter((r) => r.priority === sp.priority);
  if (sp.flag) rows = rows.filter((r) => r.flag === sp.flag);
  if (sp.noOwner === "1") rows = rows.filter((r) => r.assignees.length === 0);

  const companies = [...new Set(all.map((r) => r.companyName))].filter(Boolean).sort();
  const priorities = ["Critical", "High", "Medium", "Low"];

  // KPI counts — derived from the company/priority filter base, before flag filter
  // (so the strip shows the full triage picture for the chosen company)
  const baseForKpis = (showClosed ? all : all.filter((r) => r.status !== "Closed"))
    .filter((r) => !sp.company || r.companyName === sp.company);
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

  const visibleColumns = BOARD_STATUSES.filter((s) => showClosed || s !== "Closed");
  const columns = visibleColumns.map((s) => ({
    status: s,
    items: rows
      .filter((r) => r.status === s)
      .sort((a, b) => {
        const order = ["Critical", "High", "Medium", "Low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      }),
  }));

  const nonEmptyCols = columns.filter((c) => c.items.length > 0);
  const emptyCount = columns.length - nonEmptyCols.length;
  const total = rows.length;
  const hasFilters = Boolean(sp.company || sp.priority || sp.flag || sp.noOwner || sp.closed);
  const currentQuery = buildQuery(sp);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        sub={`${total} ${showClosed ? "task" : "open task"}${total === 1 ? "" : "s"}`}
        action={
          <LinkButton href="/task/new">
            <Plus size={14} /> New Task
          </LinkButton>
        }
      />

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
          {/* Preserve flag/noOwner across submits */}
          {sp.flag && <input type="hidden" name="flag" value={sp.flag} />}
          {sp.noOwner && <input type="hidden" name="noOwner" value={sp.noOwner} />}
          {sp.closed && <input type="hidden" name="closed" value={sp.closed} />}

          <select name="company" defaultValue={sp.company || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Companies</option>
            {companies.map((c) => (<option key={c}>{c}</option>))}
          </select>
          <select name="priority" defaultValue={sp.priority || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Priorities</option>
            {priorities.map((p) => (<option key={p}>{p}</option>))}
          </select>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90">
            Apply
          </button>
          {hasFilters && (
            <Link href="/task" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
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
          <div className="ml-auto text-xs text-fg-muted">
            <Link href="/registry" className="hover:text-fg">Open registry view →</Link>
          </div>
        </form>
      </Card>

      {/* Saved views */}
      <SavedViewsBar initialViews={savedViews} currentQuery={currentQuery} hasFilters={hasFilters} />

      {total === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<CheckSquare size={32} />}
            title={hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={hasFilters ? "Try resetting or pick a different view." : "Create one with Quick Capture or via New Task."}
          />
        </Card>
      ) : (
        <>
          {emptyCount > 0 && (
            <div className="text-xs text-fg-subtle px-1">
              {emptyCount} empty column{emptyCount === 1 ? "" : "s"} hidden
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {nonEmptyCols.map((col) => (
              <div key={col.status} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    {col.status}
                  </div>
                  <div className="text-xs text-fg-subtle tabular">{col.items.length}</div>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {col.items.map((r) => (
                    <div
                      key={r.id}
                      className="card p-3 hover:border-accent transition-colors border-l-4"
                      style={{ borderLeftColor: r.companyAccent || "transparent" }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <Link
                          href={`/task/${r.code}`}
                          className="font-mono text-[10px] text-fg-muted hover:text-fg"
                        >
                          {r.code}
                        </Link>
                        <InlineEdit field="priority" taskCode={r.code} value={r.priority}>
                          <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                        </InlineEdit>
                      </div>
                      <TaskHover
                        actionItem={r.actionItem}
                        latestUpdate={r.latestUpdate}
                        assignees={r.assignees}
                        status={r.status}
                        priority={r.priority}
                      >
                        <Link href={`/task/${r.code}`} className="block">
                          <div className="text-sm leading-snug mb-2 line-clamp-3">
                            {r.actionItem}
                          </div>
                        </Link>
                      </TaskHover>
                      <div className="flex items-center justify-between text-xs text-fg-muted">
                        <span className="truncate">{r.companyName}</span>
                        <InlineEdit
                          field="deadline"
                          taskCode={r.code}
                          value={r.deadline ? r.deadline.toISOString() : null}
                          className="whitespace-nowrap"
                        >
                          <Deadline date={r.deadline} />
                        </InlineEdit>
                      </div>
                      {r.assignees.length > 0 && (
                        <div className="text-xs text-fg-subtle mt-1 truncate">
                          {r.assignees.join(", ")}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-1">
                        <InlineEdit field="status" taskCode={r.code} value={r.status}>
                          <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
                        </InlineEdit>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {emptyCount > 0 && (
            <details className="text-xs text-fg-subtle px-1">
              <summary className="cursor-pointer hover:text-fg-muted">Show empty columns</summary>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {columns.filter((c) => c.items.length === 0).map((c) => (
                  <div
                    key={c.status}
                    className="border border-dashed border-border rounded-lg px-3 py-4 text-center text-xs text-fg-subtle"
                  >
                    <Inbox size={14} className="mx-auto mb-1 opacity-50" />
                    {c.status}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
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
