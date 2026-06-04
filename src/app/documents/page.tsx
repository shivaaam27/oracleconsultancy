import { PageHeader } from "@/components/ui";
import { DocumentsTable } from "@/components/documents-table";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [documents, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listDocuments({ includeArchived: true }),
    sb.from("companies").select("id,name,accent_color").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
  }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

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
  const expired = live.filter((d) => deriveDocStatus(d) === "Expired").length;
  const expiring = live.filter((d) => deriveDocStatus(d) === "Expiring").length;
  const sub = `${live.length} tracked · ${expired} expired · ${expiring} expiring soon`;

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Documents & Compliance" sub={sub} />
      <DocumentsTable documents={documents} companies={companies} people={people} linkedTasks={linkedTasks} />
    </div>
  );
}
