import { getAllTasks } from "@/lib/queries";
import { computeCompanyKpis } from "@/lib/queries";
import { CompanyBreakdownTable } from "@/components/company-breakdown-table";
import { CompanyKpiStrip } from "@/app/companies/[id]/_tabs/company-kpis";
import { MomentumStrip } from "@/app/companies/[id]/_tabs/momentum-strip";
import { CompanySummary } from "@/components/company-summary";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { flagLabel } from "@/lib/derive";
import { Badge, TableShell, Th, Td } from "@/components/ui";
import { Deadline } from "@/components/deadline";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import type { TaskRow } from "@/lib/queries";

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  if (f === "closed") return "default";
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export async function CompaniesSection({ coId }: { coId: number | null }) {
  const all = await getAllTasks();

  /* ── Company detail view ── */
  if (coId !== null) {
    const rows = all.filter((r) => r.companyId === coId);
    if (rows.length === 0) {
      return (
        <div className="text-center py-16 text-fg-muted text-sm">
          Company not found. <Link href="/?tab=companies" className="text-accent hover:underline">Back to companies</Link>
        </div>
      );
    }
    const name = rows[0].companyName;
    const openRows = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed");

    return (
      <div className="space-y-5">
        {/* Back + header */}
        <div className="flex items-center justify-between">
          <Link
            href="/?tab=companies"
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft size={12} /> All companies
          </Link>
          <Link
            href={`/task/new?companyId=${coId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity"
          >
            <Plus size={12} /> New Task
          </Link>
        </div>

        <div>
          <h2 className="text-xl font-semibold">{name}</h2>
          <p className="text-sm text-fg-muted mt-0.5">{openRows.length} open · {rows.length} total</p>
        </div>

        <CompanyKpiStrip rows={rows} companyName={name} />
        <MomentumStrip companyId={coId} />
        <CompanySummary companyId={coId} />

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
            Open tasks ({openRows.length})
          </p>
          <Link
            href={`/?tab=tasks&company=${encodeURIComponent(name)}&all=1`}
            className="text-xs text-fg-muted hover:text-accent transition-colors"
          >
            View all tasks →
          </Link>
        </div>
        <CompanyOpenTasksTable rows={openRows} />
      </div>
    );
  }

  /* ── Company list view ── */
  const companies = computeCompanyKpis(all);

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
        {companies.length} companies
      </p>
      <CompanyBreakdownTable companies={companies} isHub />
    </div>
  );
}

function CompanyOpenTasksTable({ rows }: { rows: TaskRow[] }) {
  return (
    <TableShell>
      <table className="w-full">
        <thead>
          <tr>
            <Th>ID</Th>
            <Th>Action Item</Th>
            <Th>Accountable</Th>
            <Th>Deadline</Th>
            <Th>Status</Th>
            <Th>Flag</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-bg-subtle transition-colors">
              <Td className="font-mono text-xs text-fg-muted">
                <Link href={`/task/${r.code}`} className="hover:text-accent">{r.code}</Link>
              </Td>
              <Td className="max-w-sm">
                <TaskDrawerLink code={r.code} className="hover:text-accent text-left">
                  {r.actionItem}
                </TaskDrawerLink>
              </Td>
              <Td className="text-fg-muted">{r.assignees.join(", ")}</Td>
              <Td className="whitespace-nowrap"><Deadline date={r.deadline} /></Td>
              <Td className="whitespace-nowrap">{r.status}</Td>
              <Td><Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
