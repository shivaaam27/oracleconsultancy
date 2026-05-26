import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { PageHeader, Card, Badge, LinkButton, EmptyState } from "@/components/ui";
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
] as const;

function fmt(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

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

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const all = await getAllTasks();

  let rows = all.filter((r) => r.status !== "Closed");
  if (sp.company) rows = rows.filter((r) => r.companyName === sp.company);
  if (sp.priority) rows = rows.filter((r) => r.priority === sp.priority);

  const companies = [...new Set(all.map((r) => r.companyName))].filter(Boolean).sort();
  const priorities = ["Critical", "High", "Medium", "Low"];

  const columns = BOARD_STATUSES.map((s) => ({
    status: s,
    items: rows
      .filter((r) => r.status === s)
      .sort((a, b) => {
        const order = ["Critical", "High", "Medium", "Low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      }),
  }));

  const total = rows.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        sub={`${total} open ${total === 1 ? "task" : "tasks"}`}
        action={
          <LinkButton href="/task/new">
            <Plus size={14} /> New Task
          </LinkButton>
        }
      />

      <Card className="p-3">
        <form className="flex flex-wrap gap-2 items-center">
          <select
            name="company"
            defaultValue={sp.company || ""}
            className="px-3 py-1.5 text-sm rounded-md"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={sp.priority || ""}
            className="px-3 py-1.5 text-sm rounded-md"
          >
            <option value="">All Priorities</option>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90">
            Apply
          </button>
          <Link
            href="/task"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
          >
            Reset
          </Link>
          <div className="ml-auto text-xs text-fg-muted">
            <Link href="/registry" className="hover:text-fg">Open registry view →</Link>
          </div>
        </form>
      </Card>

      {total === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<CheckSquare size={32} />}
            title="No open tasks."
            hint="Create one with Quick Capture or via New Task."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {columns.map((col) => (
            <div key={col.status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {col.status}
                </div>
                <div className="text-xs text-fg-subtle tabular">{col.items.length}</div>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {col.items.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg px-3 py-6 text-center text-xs text-fg-subtle">
                    <Inbox size={16} className="mx-auto mb-1 opacity-50" />
                    None
                  </div>
                ) : (
                  col.items.map((r) => (
                    <Link
                      key={r.id}
                      href={`/task/${r.code}`}
                      className="block card p-3 hover:border-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-mono text-[10px] text-fg-muted">{r.code}</span>
                        <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                      </div>
                      <div className="text-sm leading-snug mb-2 line-clamp-3">
                        {r.actionItem}
                      </div>
                      <div className="flex items-center justify-between text-xs text-fg-muted">
                        <span className="truncate">{r.companyName}</span>
                        <span className="whitespace-nowrap">{fmt(r.deadline)}</span>
                      </div>
                      {r.assignees.length > 0 && (
                        <div className="text-xs text-fg-subtle mt-1 truncate">
                          {r.assignees.join(", ")}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-1">
                        <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
