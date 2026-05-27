import { getAllTasks, type TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { PageHeader, TableShell, Th, Td, Badge, LinkButton } from "@/components/ui";
import { CompanySummary } from "@/components/company-summary";
import { Deadline } from "@/components/deadline";
import { CompanyTabs, parseCompanyTab } from "./_tabs/tabs";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyKpiStrip } from "./_tabs/company-kpis";
import { MomentumStrip } from "./_tabs/momentum-strip";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ArrowLeft } from "lucide-react";

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
  const tableRows = tab === "tasks" ? rows : openRows;

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

      <CompanyTabs companyId={companyId} current={tab} />

      {tab === "overview" && (
        <>
          <CompanyKpiStrip rows={rows} companyName={name} />
          <MomentumStrip companyId={companyId} />
          <CompanySummary companyId={companyId} />
          <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted pt-2">
            Open tasks
          </h2>
          <CompanyTaskTable rows={openRows} flagBadgeTone={flagBadgeTone} />
        </>
      )}

      {tab === "tasks" && (
        <>
          <CompanyKpiStrip rows={rows} companyName={name} />
          <div className="text-xs text-fg-muted">
            Showing all {rows.length} tasks (including completed and closed).
            {" "}
            <Link href={`/task?view=table&company=${encodeURIComponent(name)}`} className="text-accent hover:underline">
              Open in main Tasks view →
            </Link>
          </div>
          <CompanyTaskTable rows={tableRows} flagBadgeTone={flagBadgeTone} />
        </>
      )}

      {tab === "timeline" && (
        <TimelineTab companyTasks={rows} companyId={companyId} filterParam={sp.tl} />
      )}
    </div>
  );
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
      <table className="w-full">
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
                <Link href={`/task/${r.code}`} className="hover:text-accent">{r.actionItem}</Link>
              </Td>
              <Td className="text-fg-muted">{r.assignees.join(", ")}</Td>
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
