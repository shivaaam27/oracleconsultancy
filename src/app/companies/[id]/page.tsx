import { getAllTasks } from "@/lib/queries";
import { PageHeader, LinkButton } from "@/components/ui";
import { CompanySummary } from "@/components/company-summary";
import { CompanyTabs, parseCompanyTab } from "./_tabs/tabs";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyKpiStrip } from "./_tabs/company-kpis";
import { MomentumStrip } from "./_tabs/momentum-strip";
import { TableView } from "@/app/task/_views/table-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ExternalLink, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const DEADLINE_RANK = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);

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

  const openRows = rows
    .filter((r) => r.status !== "Completed" && r.status !== "Closed")
    .sort((a, b) => DEADLINE_RANK(a.deadline) - DEADLINE_RANK(b.deadline));
  const completedRows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");

  return (
    <div className="space-y-4">
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
          {/* Compact KPI pills, then the tasks table immediately — data first. */}
          <CompanyKpiStrip rows={rows} companyName={name} />

          <div className="flex items-center justify-between pt-1">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Open tasks ({openRows.length})
            </h2>
            <Link
              href={`/?tab=tasks&company=${encodeURIComponent(name)}`}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
            >
              <ExternalLink size={11} /> Open in Tasks
            </Link>
          </div>
          {openRows.length === 0 ? (
            <div className="text-sm text-fg-muted px-1 py-6 text-center">No open tasks. 🎉</div>
          ) : (
            <SelectionProvider>
              <TableView rows={openRows} hideCompany />
              <BulkBar />
            </SelectionProvider>
          )}

          {/* Insights — available but collapsed so they never block the tasks. */}
          <details className="group glass elevated rounded-2xl overflow-hidden mt-2">
            <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium list-none">
              <ChevronRight size={14} className="text-fg-muted transition-transform group-open:rotate-90" />
              Company insights
              <span className="text-xs text-fg-subtle font-normal">momentum &amp; AI briefing</span>
            </summary>
            <div className="px-4 pb-4 space-y-4">
              <MomentumStrip companyId={companyId} />
              <CompanySummary companyId={companyId} />
            </div>
          </details>
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
            <SelectionProvider>
              <TableView rows={completedRows} hideCompany />
              <BulkBar />
            </SelectionProvider>
          )}
        </>
      )}

      {tab === "timeline" && (
        <TimelineTab companyTasks={rows} companyId={companyId} filterParam={sp.tl} />
      )}
    </div>
  );
}
