import { getAllTasks } from "@/lib/queries";
import { CompanySummary } from "@/components/company-summary";
import { CompanyActions } from "./_tabs/company-actions";
import { ViewPublisher } from "@/components/view-publisher";
import { CompanyTabs, parseCompanyTab } from "./_tabs/tabs";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyKpiStrip } from "./_tabs/company-kpis";
import { CompanyDocuments } from "./_tabs/company-documents";
import { CompanyProfile } from "./_tabs/company-profile";
import { SuggestionTray } from "@/components/suggestion-tray";
import { listProfileSuggestions } from "@/lib/profile-suggestions";
import { listCustomShelves } from "@/lib/shelves";
import { getCompanyRelationships } from "@/lib/relationships";
import { CompanyRelationships } from "@/components/company-relationships";
import { MomentumStrip } from "./_tabs/momentum-strip";
import { TableView } from "@/app/task/_views/table-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OrgChart } from "@/components/org-chart";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { buildCompanyTree } from "@/lib/org-chart";
import { getOrgExtras } from "@/lib/org-extras";
import { getDepartmentHeads } from "@/lib/departments";
import { ErrorBoundary } from "@/components/error-boundary";
import { ComplianceSummaryCard } from "@/components/compliance-summary-card";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { listDocuments } from "@/lib/documents";
import { deriveDocStatus, expiryLabel } from "@/lib/documents-shared";
import { listAssets } from "@/lib/assets";
import type { AssetRow } from "@/lib/assets-shared";
import { listVendors } from "@/lib/vendors";
import type { VendorRow } from "@/lib/vendors-shared";
import { sb } from "@/db/supabase";
import { getCompanyLogoUrl } from "@/lib/company-brand";
import { CompanyAvatar } from "@/components/company-avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  ChevronRight,
  Clock,
  AlertOctagon,
  Users,
  FileText,
  FileWarning,
  Package,
  Truck,
  Network,
} from "lucide-react";

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
  const [allRows, documents, { data: companyRaw }, { data: assocRaw }, { data: companiesRaw }, { data: peopleRaw }, logoUrl] =
    await Promise.all([
      getAllTasks(),
      listDocuments(),
      sb
        .from("companies")
        .select("id,name,accent_color,file_prefix,legal_name,registration_no,tin,vrn,incorporation_date,address,phone,email,signatory_name,signatory_title,sector_regulated")
        .eq("id", companyId)
        .maybeSingle(),
      sb.from("person_companies").select("person_id").eq("company_id", companyId),
      sb.from("companies").select("id,name").order("name"),
      sb.from("people").select("id,name,role,company_id").eq("active", true).order("name"),
      getCompanyLogoUrl(companyId),
    ]);
  const companiesList = (companiesRaw ?? []) as Array<{ id: number; name: string }>;
  const peopleList = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const peopleById = new Map(
    (peopleRaw ?? []).map((p) => [p.id as number, { name: p.name as string, role: (p.role as string | null) ?? null }])
  );
  // A person belongs to this company via their primary company_id OR an explicit
  // person_companies association.
  const assocPersonIds = new Set<number>((assocRaw ?? []).map((r) => r.person_id as number));
  for (const p of peopleRaw ?? []) {
    if ((p.company_id as number | null) === companyId) assocPersonIds.add(p.id as number);
  }
  const teamCount = assocPersonIds.size;
  // This company's tasks = tasks owned by the company OR involving anyone who
  // belongs to it (primary company or a person_companies link), so a multi-company
  // person's work shows up here too.
  const rows = allRows.filter(
    (r) =>
      r.companyId === companyId ||
      (r.ownerId != null && assocPersonIds.has(r.ownerId)) ||
      r.assigneeIds.some((aid) => assocPersonIds.has(aid))
  );
  // A real company with zero tasks must still render — gate not-found on the
  // COMPANY row missing, not on having no tasks. Name/accent come from the
  // company record (tasks are only a fallback for older accent data).
  if (!companyRaw) return notFound();
  const name = (companyRaw.name as string | null) ?? rows[0]?.companyName ?? "Company";
  const accent = (companyRaw.accent_color as string | null) || rows[0]?.companyAccent || "hsl(var(--accent))";
  const complianceScore = (
    await buildCompanyRequirementScores([{ id: companyId, name: (companyRaw?.name as string | undefined) ?? name }])
  )[0];

  const openRows = rows
    .filter((r) => r.status !== "Completed" && r.status !== "Closed")
    .sort((a, b) => DEADLINE_RANK(a.deadline) - DEADLINE_RANK(b.deadline));
  const completedRows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");
  const overdueCount = openRows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;

  // Company documents (this company's files), with derived lifecycle status.
  const companyDocs = documents.filter((doc) => doc.companyId === companyId);
  const attentionDocs = companyDocs
    .map((doc) => ({ doc, status: deriveDocStatus(doc) }))
    .filter((x) => x.status === "Expired" || x.status === "Expiring")
    .sort((a, b) => DEADLINE_RANK(a.doc.expiryDate) - DEADLINE_RANK(b.doc.expiryDate));

  // Staff files: documents owned by people associated with this company,
  // grouped per person (separate from the company's own documents).
  const staffGroups = (() => {
    const byPerson = new Map<number, typeof documents>();
    for (const doc of documents) {
      if (doc.personId == null || !assocPersonIds.has(doc.personId)) continue;
      const list = byPerson.get(doc.personId) ?? [];
      list.push(doc);
      byPerson.set(doc.personId, list);
    }
    return [...byPerson.entries()]
      .map(([personId, docs]) => ({
        personId,
        personName: peopleById.get(personId)?.name ?? `Person ${personId}`,
        role: peopleById.get(personId)?.role ?? null,
        docs,
      }))
      .sort((a, b) => a.personName.localeCompare(b.personName));
  })();

  // Profile-only: pending + auto-applied "Suggested additions" + custom shelves +
  // the pipeline stage of any document (so the Documents list shows it at a glance).
  const [profileSuggestions, appliedSuggestions, customShelves, pipelineRows, relationships] = tab === "profile"
    ? await Promise.all([
        listProfileSuggestions({ companyId, status: "pending" }),
        listProfileSuggestions({ companyId, status: "applied" }),
        listCustomShelves(),
        sb.from("pipeline").select("document_id,stage").eq("company_id", companyId).eq("archived", false),
        getCompanyRelationships(companyId),
      ])
    : [[], [], [], { data: [] as Array<{ document_id: number | null; stage: string }> }, []];
  const stageByDoc: Record<number, string> = {};
  for (const r of (pipelineRows as { data: Array<{ document_id: number | null; stage: string }> }).data ?? []) {
    if (r.document_id != null) stageByDoc[r.document_id] = r.stage;
  }

  // Overview-only: assets at this company + its suppliers (heavier, so lazy).
  let overviewExtras: null | { assets: AssetRow[]; vendors: VendorRow[] } = null;
  if (tab === "overview") {
    const [assets, vendors] = await Promise.all([listAssets(), listVendors()]);
    overviewExtras = {
      assets: assets.filter((a) => a.companyId === companyId || a.assignedToCompanyId === companyId),
      vendors: vendors.filter((v) => v.companyId === companyId),
    };
  }

  // Org tab data (only when viewing the Org tab — these queries are heavier).
  let orgTab: null | {
    tree: ReturnType<typeof buildCompanyTree>;
    extras: Awaited<ReturnType<typeof getOrgExtras>>;
    associated: Array<{ id: number; name: string; role: string | null; relationship: string | null; personType: string }>;
    deptHeads: Record<string, number>;
    pickerPeople: Array<{ id: number; name: string; companyName: string | null }>;
  } = null;
  if (tab === "org") {
    const [allPeople, extras, deptHeads] = await Promise.all([getAllPeopleWithWorkload(), getOrgExtras(), getDepartmentHeads()]);
    const associated = allPeople
      .filter((p) => p.active)
      .flatMap((p) => p.associations.filter((a) => a.companyId === companyId).map((a) => ({ id: p.id, name: p.name, role: p.role, relationship: a.relationship, personType: p.personType })));
    const pickerPeople = allPeople.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, companyName: p.companyName }));
    orgTab = { tree: buildCompanyTree(allPeople, companyId), extras, associated, deptHeads, pickerPeople };
  }

  return (
    <div className="mx-auto max-w-[880px] space-y-3.5">
      <HrmsCrumbs from={sp.from} />

      {/* Header — company accent identity, count chips, New Task pill */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyAvatar name={name} accent={accent} logoUrl={logoUrl} size={44} iconSize={19} />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{name}</h1>
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

      <CompanyTabs companyId={companyId} current={tab} openCount={openRows.length} />

      {tab === "overview" && (
        <>
          {/* Publish this company's open tasks so the assistant can bulk-act on "these". */}
          <ViewPublisher codes={openRows.map((r) => r.code)} label={`${name} · open tasks`} />

          {/* At-a-glance tiles — the company file health in one row. Compliance is
              NOT a tile here: the richer ComplianceSummaryCard below owns it (it
              was shown three times on this page). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <StatTile label="Open tasks" value={openRows.length} Icon={Clock} tone="info" href={`/companies/${companyId}?tab=tasks`} />
            <StatTile
              label="Overdue"
              value={overdueCount}
              Icon={AlertOctagon}
              tone={overdueCount ? "danger" : "muted"}
              href={`/?tab=tasks&view=table&company=${encodeURIComponent(name)}&flag=overdue`}
            />
            <StatTile label="Team" value={teamCount ?? 0} Icon={Users} tone="info" href={`/companies/${companyId}?tab=org`} />
            <StatTile label="Documents" value={companyDocs.length} Icon={FileText} tone="info" href={`/documents?company=${companyId}`} />
            <StatTile
              label="Expiring"
              value={attentionDocs.length}
              Icon={FileWarning}
              tone={attentionDocs.length ? "warn" : "muted"}
              href={`/documents?company=${companyId}`}
            />
          </div>

          {complianceScore && <ComplianceSummaryCard score={complianceScore} />}

          {/* Documents needing attention — expired / expiring company files. */}
          {attentionDocs.length > 0 && (
            <section className="glass elevated rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
                  <FileWarning size={13} /> Documents needing attention
                </h2>
                <Link
                  href={`/documents?company=${companyId}`}
                  className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
                >
                  <ExternalLink size={12} /> All documents
                </Link>
              </div>
              <ul className="divide-y divide-border/50">
                {attentionDocs.slice(0, 5).map(({ doc, status }) => (
                  <li key={doc.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.title}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">
                        {doc.category ?? "Uncategorised"}
                        {expiryLabel(doc) ? ` · ${expiryLabel(doc)}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        status === "Expired" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                      }`}
                    >
                      {status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Open tasks — compact preview; the full table lives on the Tasks tab. */}
          <section className="space-y-2">
            <div className="flex items-center justify-between pt-1">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
                Open tasks
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">
                  {openRows.length}
                </span>
              </h2>
              <Link
                href={`/companies/${companyId}?tab=tasks`}
                className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
              >
                <ExternalLink size={12} /> Open in Tasks
              </Link>
            </div>
            <CompanyKpiStrip rows={rows} companyName={name} />
            {openRows.length === 0 ? (
              <div className="text-sm text-fg-muted px-1 py-6 text-center">No open tasks. 🎉</div>
            ) : (
              <ul className="glass elevated rounded-2xl divide-y divide-border/50 overflow-hidden">
                {openRows.slice(0, 5).map((r) => (
                  <li key={r.code}>
                    <Link href={`/task/${r.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted/50 transition-colors">
                      <span className="text-[11px] font-semibold tabular text-fg-subtle shrink-0">{r.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.actionItem}</span>
                      {r.deadline && (
                        <span className="shrink-0 text-[11px] text-fg-subtle tabular">
                          {r.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <ChevronRight size={14} className="text-fg-subtle shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Equipment & suppliers — assets at this company and its vendors. */}
          {overviewExtras && (overviewExtras.assets.length > 0 || overviewExtras.vendors.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {overviewExtras.assets.length > 0 && (
                <section className="glass elevated rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Package size={14} className="text-accent" /> Equipment
                      <span className="text-[11px] font-normal text-fg-subtle tabular">{overviewExtras.assets.length}</span>
                    </h2>
                    <Link href="/hrms/assets" className="text-[11px] text-fg-muted hover:text-accent transition-colors">All</Link>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {overviewExtras.assets.slice(0, 5).map((a) => (
                      <li key={a.id} className="px-4 py-2">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="block truncate text-[11px] text-fg-subtle">
                          {[a.custodianName ?? a.assignedToName, a.location, a.tag].filter(Boolean).join(" · ") || "Unassigned"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {overviewExtras.vendors.length > 0 && (
                <section className="glass elevated rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Truck size={14} className="text-accent" /> Suppliers
                      <span className="text-[11px] font-normal text-fg-subtle tabular">{overviewExtras.vendors.length}</span>
                    </h2>
                    <Link href="/hrms/assets?tab=vendors" className="text-[11px] text-fg-muted hover:text-accent transition-colors">All</Link>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {overviewExtras.vendors.slice(0, 5).map((v) => (
                      <li key={v.id} className="flex items-center gap-2 px-4 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{v.name}</span>
                          <span className="block truncate text-[11px] text-fg-subtle">
                            {[v.category, v.docCount ? `${v.docCount} doc${v.docCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Supplier"}
                          </span>
                        </span>
                        {(v.expiredCount > 0 || v.expiringCount > 0) && (
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${v.expiredCount > 0 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                            {v.expiredCount > 0 ? "Expired" : "Expiring"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* Insights — available but collapsed so they never block the snapshot. */}
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

      {tab === "profile" && (
        <div className="space-y-3.5">
          <SuggestionTray suggestions={profileSuggestions} applied={appliedSuggestions} companyId={companyId} />
          <CompanyRelationships relationships={relationships} />
          <Link href={`/graph?type=company&id=${companyId}`} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60">
            <Network size={13} /> Explore all connections
          </Link>
          <CompanyProfile
            companyId={companyId}
            companyName={name}
            accent={accent}
            logoUrl={logoUrl}
            profile={{
              filePrefix: (companyRaw?.file_prefix as string | null) ?? null,
              legalName: (companyRaw?.legal_name as string | null) ?? null,
              registrationNo: (companyRaw?.registration_no as string | null) ?? null,
              tin: (companyRaw?.tin as string | null) ?? null,
              vrn: (companyRaw?.vrn as string | null) ?? null,
              incorporationDate: companyRaw?.incorporation_date
                ? new Date(companyRaw.incorporation_date as string).toISOString().slice(0, 10)
                : null,
              address: (companyRaw?.address as string | null) ?? null,
              phone: (companyRaw?.phone as string | null) ?? null,
              email: (companyRaw?.email as string | null) ?? null,
              signatoryName: (companyRaw?.signatory_name as string | null) ?? null,
              signatoryTitle: (companyRaw?.signatory_title as string | null) ?? null,
              sectorRegulated: !!(companyRaw?.sector_regulated as boolean | null),
            }}
          />
          {/* CompanyKeyDocuments removed: the statutory numbers/expiries it showed
              are the Statutory checklist's job (they were displayed three times on
              this tab). The checklist below is the single home for them. */}
          <CompanyDocuments
            companyId={companyId}
            companyName={name}
            documents={companyDocs}
            staffGroups={staffGroups}
            companies={companiesList}
            people={peopleList}
            customShelves={customShelves}
            stageByDoc={stageByDoc}
          />
        </div>
      )}

      {tab === "tasks" && (
        <>
          <CompanyKpiStrip rows={rows} companyName={name} />
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
              <ExternalLink size={12} /> Open in hub Tasks
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

          {/* Completed & closed fold in under Tasks rather than a separate tab. */}
          <details className="group glass elevated rounded-2xl overflow-hidden mt-2">
            <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium list-none">
              <ChevronRight size={14} className="text-fg-muted transition-transform group-open:rotate-90" />
              Completed &amp; closed
              <span className="text-xs text-fg-subtle font-normal tabular">{completedRows.length}</span>
            </summary>
            <div className="px-2 pb-2">
              {completedRows.length === 0 ? (
                <div className="text-sm text-fg-muted px-2 py-6 text-center">
                  Nothing completed yet. Finished tasks move here automatically.
                </div>
              ) : (
                <SelectionProvider>
                  <BulkBar />
                  <TableView rows={completedRows} hideCompany />
                </SelectionProvider>
              )}
            </div>
          </details>
        </>
      )}

      {tab === "timeline" && (
        <TimelineTab companyTasks={rows} companyId={companyId} filterParam={sp.tl} />
      )}

      {tab === "org" && orgTab && (
        <ErrorBoundary label="company-org">
        <OrgChart
          companies={[{ id: companyId, name, accentColor: (companyRaw.accent_color as string | null) ?? rows[0]?.companyAccent ?? null }]}
          trees={{ [companyId]: orgTab.tree }}
          extras={orgTab.extras}
          associatedByCompany={{ [companyId]: orgTab.associated }}
          deptHeads={orgTab.deptHeads}
          pickerPeople={orgTab.pickerPeople}
          initialCompanyId={companyId}
          showSwitcher={false}
          showEveryone={false}
        />
        </ErrorBoundary>
      )}
    </div>
  );
}

type Tone = "info" | "danger" | "warn" | "success" | "muted";

const TONE_CLS: Record<Tone, string> = {
  info: "text-info",
  danger: "text-danger",
  warn: "text-warn",
  success: "text-success",
  muted: "text-fg-muted",
};

function StatTile({
  label,
  value,
  Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: Tone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="glass elevated rounded-2xl p-3 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        <Icon size={12} className={TONE_CLS[tone]} /> {label}
      </span>
      <span className={`text-xl font-semibold tabular ${TONE_CLS[tone]}`}>{value}</span>
    </Link>
  );
}
