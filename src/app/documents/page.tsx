import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { DocumentsWorkspace } from "./documents-workspace";
import { listDocuments } from "@/lib/documents";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { normalizePersonType } from "@/lib/person-types";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

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

  // Linked renewal/action tasks per document (backward link, mirrors meeting_tasks).
  const { data: linkRows } = await sb.from("document_links").select("document_id, tasks(code,status)");
  const linkedTasks: Record<number, Array<{ code: string; status: string }>> = {};
  for (const row of linkRows ?? []) {
    const docId = row.document_id as number;
    const t = (row as { tasks?: { code?: string; status?: string } | { code?: string; status?: string }[] }).tasks;
    const rec = Array.isArray(t) ? t[0] : t;
    if (rec?.code) (linkedTasks[docId] ||= []).push({ code: rec.code, status: rec.status ?? "" });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <HrmsCrumbs from={from} />
      <DocumentsWorkspace
        documents={documents}
        companies={companies}
        people={people}
        linkedTasks={linkedTasks}
      />
    </div>
  );
}
