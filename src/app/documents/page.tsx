import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { DocumentsWorkspace } from "./documents-workspace";
import { listDocuments } from "@/lib/documents";
import { buildCompanyRequirementScores, ensureAllCompanyRequirements } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { getUntrackedCompanyIds } from "@/lib/compliance-tracking";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { leaveMetrics } from "@/lib/leave";
import { normalizePersonType } from "@/lib/person-types";
import { listPendingInbox } from "@/app/inbox/actions";
import { getIntakeBucket } from "@/app/documents/actions";
import { getSortingDeskItems } from "@/lib/sorting-desk";
import { checkSystemHealth } from "@/lib/system-health";
import { listAutomationFeed } from "@/app/automations/actions";
import { computeIntakeMetrics } from "@/lib/intake-metrics";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; tab?: string }>;
}) {
  const { from, tab } = await searchParams;
  const onSortTab = tab === "sort";

  // ── Library data (was /documents) ────────────────────────────────
  const [documents, { data: companiesRaw }, { data: peopleRaw }, logoMap] = await Promise.all([
    listDocuments({ includeArchived: true }),
    sb.from("companies").select("id,name,accent_color,aliases").order("name"),
    sb.from("people").select("id,name,person_type").eq("active", true).order("name"),
    getCompanyLogoMap(),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
    aliases: (c.aliases as string[] | null) ?? undefined,
    logoUrl: logoMap.get(c.id as number) ?? null,
  }));
  const people = (peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    personType: normalizePersonType(p.person_type as string | null),
  }));

  await ensureAllCompanyRequirements(companies.map((c) => c.id));
  // Statutory compliance is only scored for companies the owner tracks; the rest
  // just hold documents (no score, no "missing", no 0%). See compliance-tracking.ts.
  const untrackedSet = await getUntrackedCompanyIds();
  const trackedCompanies = companies.filter((c) => !untrackedSet.has(c.id));
  const [companyScores, personScores, { pending: pendingLeave }] = await Promise.all([
    buildCompanyRequirementScores(trackedCompanies),
    buildPersonRequirementScores(),
    leaveMetrics(),
  ]);
  // Untracked companies (with a live document count from the loaded list) for the
  // "N not tracked" footer on the compliance cards.
  const docCountByCompany = new Map<number, number>();
  for (const d of documents) if (!d.archived && d.companyId) docCountByCompany.set(d.companyId, (docCountByCompany.get(d.companyId) ?? 0) + 1);
  const untrackedCompanies = companies
    .filter((c) => untrackedSet.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, docCount: docCountByCompany.get(c.id) ?? 0 }));

  // Linked renewal/action tasks per document (backward link, mirrors meeting_tasks).
  const { data: linkRows } = await sb.from("document_links").select("document_id, tasks(code,status)");
  const linkedTasks: Record<number, Array<{ code: string; status: string }>> = {};
  for (const row of linkRows ?? []) {
    const docId = row.document_id as number;
    const t = (row as { tasks?: { code?: string; status?: string } | { code?: string; status?: string }[] }).tasks;
    const rec = Array.isArray(t) ? t[0] : t;
    if (rec?.code) (linkedTasks[docId] ||= []).push({ code: rec.code, status: rec.status ?? "" });
  }

  // ── To Sort / Trash data (was /inbox) ────────────────────────────
  // The queues + trash are always needed (hero counts, Trash tab). The four heavy
  // "system status" panels are only shown on the To Sort tab, so fetch them only
  // then — the default Library view stays as light as the old /documents page.
  const [inboxItems, sortItems, trash] = await Promise.all([
    listPendingInbox(),
    getSortingDeskItems(),
    getIntakeBucket("trash"),
  ]);
  const [automation, health, safetyFindings, intakeMetrics] = onSortTab
    ? await Promise.all([listAutomationFeed(), checkSystemHealth(), gatherSafetyFindings(), computeIntakeMetrics(30)])
    : [null, null, null, null];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <HrmsCrumbs from={from} />
      <DocumentsWorkspace
        documents={documents}
        companies={companies}
        people={people}
        linkedTasks={linkedTasks}
        companyScores={companyScores}
        personScores={personScores}
        untrackedCompanies={untrackedCompanies}
        pendingLeave={pendingLeave}
        inboxItems={inboxItems}
        sortItems={sortItems}
        trash={trash}
        automation={automation}
        health={health}
        safetyFindings={safetyFindings}
        intakeMetrics={intakeMetrics}
      />
    </div>
  );
}
