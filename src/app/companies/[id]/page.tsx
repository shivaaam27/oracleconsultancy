import { getAllTasks } from "@/lib/queries";
import { CompanySummary } from "@/components/company-summary";
import { CompanyActions } from "./_tabs/company-actions";
import { ViewPublisher } from "@/components/view-publisher";
import { CompanyTabs, parseCompanyTab } from "./_tabs/tabs";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyKpiStrip } from "./_tabs/company-kpis";
import { MomentumStrip } from "./_tabs/momentum-strip";
import { TableView } from "@/app/task/_views/table-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { ComplianceSummaryCard } from "@/components/compliance-summary-card";
import { buildCompanyComplianceScores } from "@/lib/compliance";
import { listDocuments } from "@/lib/documents";
import { sb } from "@/db/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ChevronRight, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

const DEADLINE_RANK = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tl?: string; from?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const companyId = parseInt(id, 10);
  const tab = parseCompanyTab(sp.tab);
  const [allRows, documents, { data: companyRaw }] = await Promise.all([
    getAllTasks(),
    listDocuments(),
    sb.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
  ]);
  const rows = allRows.filter((r) => r.companyId === companyId);
  if (!rows.length) return notFound();
  const name = rows[0].companyName;
  const accent = rows[0].companyAccent || "hsl(var(--accent))";
  const complianceScore = buildCompanyComplianceScores(
    [{ id: companyId, name: (companyRaw?.name as string | undefined) ?? name }],
    documents
  )[0];

  const openRows = rows
    .filter((r) => r.status !== "Completed" && r.status !== "Closed")
    .sort((a, b) => DEADLINE_RANK(a.deadline) - DEADLINE_RANK(b.deadline));
  const completedRows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");

  return (
    <div className="space-y-4">
      <HrmsCrumbs from={sp.from} />

      {/* Header — company accent identity, count chips, New Task pill */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: accent }}
          >
            <Building2 size={19} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">{name}</h1>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-info-soft/60 ring-1 ring-info/30 text-info tabular">
                {openRows.length} open
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-subtle/70 ring-1 ring-border/60 text-fg-muted tabular">
                {rows.length} total
              </span>
            </div>
          </div>
        </div>
      </div>
      <CompanyActions companyId={companyId} companyName={name} />

      <CompanyTabs companyId={companyId} current={tab} completedCount={completedRows.length} />

      {tab === "overview" && (
        <>
          {/* Publish this company's open tasks so the assistant can bulk-act on "these". */}
          <ViewPublisher codes={openRows.map((r) => r.code)} label={`${name} · open tasks`} />
          {/* Compact KPI pills, then the tasks table immediately — data first. */}
          <CompanyKpiStrip rows={rows} companyName={name} />
          {complianceScore && <ComplianceSummaryCard score={complianceScore} />}

          <div className="flex items-center justify-between pt-1">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
              Open tasks
              <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">
                {openRows.length}
              </span>
            </h2>
            <Link
              href={`/?tab=tasks&company=${encodeURIComponent(name)}`}
              className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
            >
              <ExternalLink size={12} /> Open in Tasks
            </Link>
          </div>
          {openRows.length === 0 ? (
            <div className="text-sm text-fg-muted px-1 py-6 text-center">No open tasks. 🎉</div>
          ) : (
            <SelectionProvider>
              <BulkBar />
              <TableView rows={openRows} hideCompany />
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
              <BulkBar />
              <TableView rows={completedRows} hideCompany />
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
