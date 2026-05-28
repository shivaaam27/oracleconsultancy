import { getAllTasks, type TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { PageHeader, TableShell, Th, Td, Badge, LinkButton } from "@/components/ui";
import { CompanySummary } from "@/components/company-summary";
import { Deadline } from "@/components/deadline";
import { CompanyTabs, parseCompanyTab } from "./_tabs/tabs";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyKpiStrip } from "./_tabs/company-kpis";
import { MomentumStrip } from "./_tabs/momentum-strip";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { AssigneeList } from "@/components/assignee-list";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  if (f === "closed") return "default";
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tl?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const companyId = parseInt(id, 10);
  const tab = parseCompanyTab(sp.tab);
  const rows = (await getAllTasks()).filter((r) => r.companyId === companyId);
  if (!rows.length) return notFound();
  const name = rows[0].companyName;

  const openRows = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed");
  const completedRows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");
  const monthGroups = groupByMonth(openRows);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/companies" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={12} /> All companies
        </Link>
      </div>
      <PageHeader
        title={name}
        sub={`${openRows.length} open · ${rows.length} total`}
        action={
          <LinkButton href={`/task/new?companyId=${companyId}`}>
            <Plus size={14} /> New Task
          </LinkButton>
        }
      />

      <CompanyTabs companyId={companyId} current={tab} completedCount={completedRows.length} />

      {tab === "overview" && (
        <>
          <CompanyKpiStrip rows={rows} companyName={name} />
          <MomentumStrip companyId={companyId} />
          <CompanySummary companyId={companyId} />

          {/* Open tasks — grouped by month so the page never becomes an endless scroll */}
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Open tasks ({openRows.length})
            </h2>
            <Link
              href={`/?tab=tasks&view=table&company=${encodeURIComponent(name)}`}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
            >
              <ExternalLink size={11} /> Manage in Tasks
            </Link>
          </div>
          {openRows.length === 0 ? (
            <div className="text-sm text-fg-muted px-1 py-6 text-center">No open tasks.</div>
          ) : (
            <div className="space-y-2">
              {monthGroups.map((g) => (
                <details key={g.key} open={g.defaultOpen} className="group">
                  <summary className="flex items-center gap-2 cursor-pointer select-none py-1.5 text-sm font-medium list-none">
                    <span className="text-fg-muted transition-transform group-open:rotate-90">▸</span>
                    {g.label}
                    <span className="text-xs text-fg-subtle tabular">({g.rows.length})</span>
                  </summary>
                  <div className="pt-1">
                    <CompanyTaskTable rows={g.rows} flagBadgeTone={flagBadgeTone} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "completed" && (
        <>
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Completed &amp; closed ({completedRows.length})
            </h2>
          </div>
          {completedRows.length === 0 ? (
            <div className="text-sm text-fg-muted px-1 py-6 text-center">
              Nothing completed yet. Finished tasks move here automatically.
            </div>
          ) : (
            <CompanyTaskTable rows={completedRows} flagBadgeTone={flagBadgeTone} />
          )}
        </>
      )}

      {tab === "timeline" && (
        <TimelineTab companyTasks={rows} companyId={companyId} filterParam={sp.tl} />
      )}
    </div>
  );
}

type MonthGroup = { key: string; label: string; rows: TaskRow[]; defaultOpen: boolean };

/**
 * Group open tasks into month buckets by deadline so a company page never
 * becomes an endless scroll. Overdue (past) and the current month are open by
 * default; future months and the "No deadline" bucket are collapsed.
 */
function groupByMonth(rows: TaskRow[]): MonthGroup[] {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const buckets = new Map<string, TaskRow[]>();
  for (const r of rows) {
    const key = r.deadline
      ? `${r.deadline.getFullYear()}-${String(r.deadline.getMonth() + 1).padStart(2, "0")}`
      : "none";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
  }
  const dated = [...buckets.keys()].filter((k) => k !== "none").sort();
  const ordered = buckets.has("none") ? [...dated, "none"] : dated;
  return ordered.map((key) => {
    const groupRows = buckets.get(key)!;
    if (key === "none") {
      return { key, label: "No deadline", rows: groupRows, defaultOpen: false };
    }
    const [y, m] = key.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { key, label, rows: groupRows, defaultOpen: key <= currentKey };
  });
}

function CompanyTaskTable({
  rows,
  flagBadgeTone,
}: {
  rows: TaskRow[];
  flagBadgeTone: (f: string) => "default" | "success" | "warn" | "danger" | "info";
}) {
  return (
    <TableShell>
      <table className="w-full min-w-[640px]">
        <thead>
          <tr>
            <Th>ID</Th>
            <Th>Action Item</Th>
            <Th>Accountable</Th>
            <Th>Deadline</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Flag</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-bg-subtle transition-colors">
              <Td className="font-mono text-xs text-fg-muted">
                <Link href={`/task/${r.code}`} className="hover:text-accent">{r.code}</Link>
              </Td>
              <Td>
                <TaskDrawerLink code={r.code} className="hover:text-accent text-left">
                  {r.actionItem}
                </TaskDrawerLink>
              </Td>
              <Td className="text-fg-muted">
                <AssigneeList names={r.assignees} ids={r.assigneeIds} />
              </Td>
              <Td className="whitespace-nowrap"><Deadline date={r.deadline} /></Td>
              <Td className="whitespace-nowrap">{r.status}</Td>
              <Td className="whitespace-nowrap">{r.priority}</Td>
              <Td><Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
