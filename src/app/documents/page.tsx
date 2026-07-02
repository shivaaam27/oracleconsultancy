import { PageHeader } from "@/components/ui";
import { DocumentsTable } from "@/components/documents-table";
import { ComplianceScorePanel } from "@/components/compliance-score-panel";
import { NeedsAttentionPanel } from "@/components/needs-attention-panel";
import { RequirementTemplatesButton } from "@/components/requirement-templates-button";
import { JourneyTemplatesButton } from "@/components/journey-templates-button";
import { ComplianceExportButton } from "@/components/compliance-export-button";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { listDocuments } from "@/lib/documents";
import { buildCompanyRequirementScores, ensureAllCompanyRequirements } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { leaveMetrics } from "@/lib/leave";
import { normalizePersonType } from "@/lib/person-types";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [documents, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listDocuments({ includeArchived: true }),
    sb.from("companies").select("id,name,accent_color,aliases").order("name"),
    sb.from("people").select("id,name,person_type").eq("active", true).order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
    aliases: (c.aliases as string[] | null) ?? undefined,
  }));
  const people = (peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    personType: normalizePersonType(p.person_type as string | null),
  }));
  // Seed any not-yet-seeded company so every company scores from stored rows
  // consistently (idempotent; only writes for unseeded companies).
  await ensureAllCompanyRequirements(companies.map((c) => c.id));
  const companyScores = await buildCompanyRequirementScores(companies);
  const personScores = await buildPersonRequirementScores();
  const { pending: pendingLeave } = await leaveMetrics();

  // Linked renewal/action tasks per document (backward link, mirrors meeting_tasks).
  const { data: linkRows } = await sb.from("document_links").select("document_id, tasks(code,status)");
  const linkedTasks: Record<number, Array<{ code: string; status: string }>> = {};
  for (const row of linkRows ?? []) {
    const docId = row.document_id as number;
    const t = (row as { tasks?: { code?: string; status?: string } | { code?: string; status?: string }[] }).tasks;
    const rec = Array.isArray(t) ? t[0] : t;
    if (rec?.code) (linkedTasks[docId] ||= []).push({ code: rec.code, status: rec.status ?? "" });
  }

  const live = documents.filter((d) => !d.archived);
  // Glance counts live ONCE, in the compliance panel's headline stats — the page
  // subtitle only states how many documents are tracked (no duplicated scoreboard).
  const sub = `${live.length} tracked`;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Documents & Compliance"
        sub={sub}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ComplianceExportButton />
            <RequirementTemplatesButton />
            <JourneyTemplatesButton />
          </div>
        }
      />
      <ComplianceScorePanel companyScores={companyScores} personScores={personScores} />
      <NeedsAttentionPanel
        documents={documents}
        companies={companies}
        people={people}
        companyScores={companyScores}
        personScores={personScores}
        pendingLeaveCount={pendingLeave}
      />
      <DocumentsTable documents={documents} companies={companies} people={people} linkedTasks={linkedTasks} />
    </div>
  );
}
