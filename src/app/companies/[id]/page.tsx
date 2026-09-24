import { tasksOfCompany } from "@/lib/company-kpis";
import { getAllTasks } from "@/lib/queries";
import { CompanyActions } from "./_tabs/company-actions";
import { ViewPublisher } from "@/components/view-publisher";
import { parseCompanyTab } from "./_tabs/tabs";
import { notesLinkedTo } from "@/lib/note-links";
import { LinkedNotesList } from "@/components/linked-notes";
import { TimelineTab } from "./_tabs/timeline-tab";
import { CompanyDocuments } from "./_tabs/company-documents";
import { getCompanyRelationships } from "@/lib/relationships";
import { TableView } from "@/app/task/_views/table-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import { OrgChart } from "@/components/org-chart";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { buildCompanyTree } from "@/lib/org-chart";
import { getOrgExtras } from "@/lib/org-extras";
import { getDepartmentHeads } from "@/lib/departments";
import { ErrorBoundary } from "@/components/error-boundary";
import { listDocuments } from "@/lib/documents";
import { deriveDocStatus } from "@/lib/documents-shared";
import { listAssets } from "@/lib/assets";
import type { AssetRow } from "@/lib/assets-shared";
import { listVendors } from "@/lib/vendors";
import type { VendorRow } from "@/lib/vendors-shared";
import { sb } from "@/db/supabase";
import { getCompanyLogoUrl } from "@/lib/company-brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer, viewerCoversCompany } from "@/lib/viewer";
import { getStaffIdMap } from "@/lib/staff-id";
import { StudioCompany, type StudioCompanyData } from "@/components/studio/companies/studio-company";
import { StudioCompanyProfile } from "@/components/studio/companies/company-profile";
import { StudioPickProvider } from "@/components/studio/tasks/pick";
import { FactsPanel } from "@/components/facts-panel";
import { GovernancePanel } from "@/components/governance-panel";

export const dynamic = "force-dynamic";

const DEADLINE_RANK = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tl?: string; from?: string; tf?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const companyId = parseInt(id, 10);
  // The owner, or a director for one of their companies — view-only, apart
  // from its tasks, where a director has the owner's powers (lib/viewer.ts).
  const viewer = await getViewer();
  if (!viewer) redirect("/portal");
  if (!viewerCoversCompany(viewer, companyId)) notFound();
  const director = viewer.kind === "director";
  const asked = parseCompanyTab(sp.tab);
  // The Notes tab is the owner's notes — not a director's to read.
  const tab = director && asked === "notes" ? "overview" : asked;
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
  // This company's tasks = the tasks FILED under it — not every task its people
  // touch elsewhere (see company-kpis.ts). Matches the Tasks list and the Brief.
  const rows = tasksOfCompany(allRows, companyId);
  // A real company with zero tasks must still render — gate not-found on the
  // COMPANY row missing, not on having no tasks. Name/accent come from the
  // company record (tasks are only a fallback for older accent data).
  if (!companyRaw) return notFound();
  const name = (companyRaw.name as string | null) ?? rows[0]?.companyName ?? "Company";
  const openRows = rows
    .filter((r) => r.status !== "Completed" && r.status !== "Closed")
    .sort((a, b) => DEADLINE_RANK(a.deadline) - DEADLINE_RANK(b.deadline));
  const completedRows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");
  const overdueCount = openRows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;

  // Company documents (this company's files), with derived lifecycle status.
  const companyDocs = documents.filter((doc) => doc.companyId === companyId);

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

  // Profile-only: the pipeline stage of any document (so the Documents list shows
  // it at a glance) plus the company's relationships.
  const [pipelineRows, relationships] = tab === "profile"
    ? await Promise.all([
        sb.from("pipeline").select("document_id,stage").eq("company_id", companyId).eq("archived", false),
        getCompanyRelationships(companyId),
      ])
    : [{ data: [] as Array<{ document_id: number | null; stage: string }> }, []];
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
    orgTab = { tree: buildCompanyTree(allPeople, companyId), extras, associated, deptHeads, pickerPeople: director ? [] : pickerPeople };
  }

  // Studio (Settings → New look → Companies): mockup board Company.
  let overview: StudioCompanyData["overview"] = null;
  if (tab === "overview") {
    const [capT, sigT, resT, factT, staffIds] = await Promise.all([
      sb.from("cap_table").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      sb.from("signatories").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      sb.from("resolutions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      sb.from("facts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      getStaffIdMap(),
    ]);
    const docStatus = companyDocs.map((d) => deriveDocStatus(d));
    const isLate = (r: (typeof openRows)[number]) => r.flag === "overdue" || r.flag === "escalate-now";
    // Worst first: late, then by deadline, undated last.
    const ordered = [...openRows].sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || DEADLINE_RANK(a.deadline) - DEADLINE_RANK(b.deadline));
    const eat = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "Africa/Nairobi" }).replace(",", "");
    const primary = (peopleRaw ?? []).filter((p) => (p.company_id as number | null) === companyId);
    // Directors and heads first, then by name.
    const rank = (role: string | null) => (/director|ceo|chair/i.test(role ?? "") ? 0 : /head|manager|cfo|coo/i.test(role ?? "") ? 1 : 2);
    const assets = overviewExtras?.assets ?? [];
    const vendors = overviewExtras?.vendors ?? [];
    overview = {
      documents: {
        total: companyDocs.length,
        expired: docStatus.filter((x) => x === "Expired").length,
        expiring: docStatus.filter((x) => x === "Expiring").length,
      },
      tasks: ordered.map((r) => {
        const days = r.deadline ? Math.floor((r.deadline.getTime() - Date.now()) / 86_400_000) : null;
        return {
          code: r.code, title: r.actionItem,
          when: !r.deadline ? "no date" : isLate(r) ? `${Math.max(1, -Math.ceil((r.deadline.getTime() - Date.now()) / 86_400_000))}d late` : eat(r.deadline),
          tone: !r.deadline ? "none" as const : isLate(r) ? "late" as const : days != null && days <= 6 ? "soon" as const : "plain" as const,
        };
      }),
      staff: primary
        .map((p) => ({ id: p.id as number, name: p.name as string, role: (p.role as string | null) ?? null, staffId: staffIds.get(p.id as number) ?? null }))
        .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name)),
      alsoCount: Math.max(0, teamCount - primary.length),
      equipment: {
        assets: assets.length, vendors: vendors.length,
        expiredContracts: vendors.filter((v) => v.expiredCount > 0).length,
        items: [
          ...vendors.filter((v) => v.expiredCount > 0).map((v) => ({ name: v.name, sub: "contract expired", bad: true })),
          ...assets.map((a) => ({ name: a.name, sub: a.custodianName ?? a.assignedToName ?? a.location ?? "Unassigned" })),
          ...vendors.filter((v) => v.expiredCount === 0).map((v) => ({ name: v.name, sub: v.category ?? "Supplier" })),
        ],
      },
      governance: { capTable: capT.count ?? 0, signatories: sigT.count ?? 0, resolutions: resT.count ?? 0, facts: factT.count ?? 0 },
    };
  }
  const { data: prefixRow } = await sb.from("companies").select("code_prefix").eq("id", companyId).maybeSingle();
  const tf = sp.tf === "done" ? "done" as const : "open" as const;
  const card = "st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4";
  // Each tab in the Studio look — cards, and the Studio task list (the same
  // TableView the Tasks page draws; StudioPickProvider is what switches it).
  const studioBody =
    tab === "profile" ? (
      <StudioCompanyProfile
        companyId={companyId} companyName={name} accent={(companyRaw.accent_color as string | null) ?? null} logoUrl={logoUrl}
        profile={{
          filePrefix: (companyRaw.file_prefix as string | null) ?? null,
          legalName: (companyRaw.legal_name as string | null) ?? null,
          registrationNo: (companyRaw.registration_no as string | null) ?? null,
          tin: (companyRaw.tin as string | null) ?? null,
          vrn: (companyRaw.vrn as string | null) ?? null,
          incorporationDate: companyRaw.incorporation_date ? new Date(companyRaw.incorporation_date as string).toISOString().slice(0, 10) : null,
          address: (companyRaw.address as string | null) ?? null,
          phone: (companyRaw.phone as string | null) ?? null,
          email: (companyRaw.email as string | null) ?? null,
          signatoryName: (companyRaw.signatory_name as string | null) ?? null,
          signatoryTitle: (companyRaw.signatory_title as string | null) ?? null,
          sectorRegulated: false,
        }}
        relationships={relationships as Awaited<ReturnType<typeof getCompanyRelationships>>}
        readOnly={director}
        // A director reads their company's governance (shareholders, signatories,
        // resolutions — owner, 25 Sept 2026); the tracked facts stay the owner's.
        facts={director ? null : <FactsPanel entityType="company" entityId={companyId} defaultOpen />}
        governance={<GovernancePanel companyId={companyId} readOnly={director} />}
        documents={director ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-[15px] font-semibold">Files</h2>
              <p className="mt-0.5 text-xs text-[var(--st-muted)]">{companyDocs.length} on file — open, preview or download them in Files.</p>
            </div>
            <Link href={`/files?co=${companyId}`} className="inline-flex h-8 items-center rounded-[9px] border border-[var(--st-line)] px-3 text-xs hover:bg-[var(--st-page)]">Open {name}&apos;s files</Link>
          </div>
        ) : <CompanyDocuments companyId={companyId} companyName={name} documents={companyDocs} staffGroups={staffGroups} companies={companiesList} people={peopleList} stageByDoc={stageByDoc} />}
      />
    ) : tab === "tasks" ? (
      (tf === "done" ? completedRows : openRows).length === 0 ? (
        <section className="rounded-[20px] bg-[var(--st-surface)] px-5 py-12 text-center text-[13px] text-[var(--st-muted)]">
          {tf === "done" ? "Nothing finished yet — completed tasks land here." : `Nothing open for ${name}.`}
        </section>
      ) : (
        <StudioPickProvider>
          <SelectionProvider>
            <BulkBar />
            <TableView rows={tf === "done" ? completedRows : openRows} hideCompany />
          </SelectionProvider>
        </StudioPickProvider>
      )
    ) : tab === "notes" ? (
      <section className={card}>
        <LinkedNotesList notes={await notesLinkedTo("company", companyId)} emptyHint={`Write @${name} in any note and it will appear here.`} about={{ entity: "company", id: companyId, label: name }} />
      </section>
    ) : tab === "timeline" ? (
      <section className={card}><TimelineTab companyTasks={rows} companyId={companyId} filterParam={sp.tl} readOnly={director} /></section>
    ) : tab === "org" && orgTab ? (
      <section className={card}>
        <ErrorBoundary label="company-org">
          <OrgChart
            companies={[{ id: companyId, name, accentColor: (companyRaw.accent_color as string | null) ?? rows[0]?.companyAccent ?? null }]}
            trees={{ [companyId]: orgTab.tree }} extras={orgTab.extras} associatedByCompany={{ [companyId]: orgTab.associated }}
            deptHeads={orgTab.deptHeads} pickerPeople={director ? undefined : orgTab.pickerPeople} initialCompanyId={companyId} showSwitcher={false} showEveryone={false} readOnly={director}
          />
        </ErrorBoundary>
      </section>
    ) : null;
  return (
    <>
      {!director && <CompanyActions companyId={companyId} companyName={name} />}
      {tab === "overview" && <ViewPublisher codes={openRows.map((r) => r.code)} label={`${name} · open tasks`} />}
      <StudioCompany data={{
        readOnly: director,
        id: companyId, name, prefix: ((prefixRow?.code_prefix as string | null) ?? name.slice(0, 2)).toUpperCase(),
        open: openRows.length, late: overdueCount, people: teamCount, tab, overview, tf, doneCount: completedRows.length,
        chips: {
          overdue: overdueCount,
          dueSoon: openRows.filter((r) => r.flag === "due-soon").length,
          stalled: openRows.filter((r) => r.flag === "stalled").length,
          noDeadline: openRows.filter((r) => !r.deadline).length,
          noOwner: openRows.filter((r) => r.assignees.length === 0).length,
        },
      }}>
        {studioBody}
      </StudioCompany>
    </>
  );
}



