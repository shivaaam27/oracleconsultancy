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

  const live = documents.filter((d) => !d.archived);
  const expired = live.filter((d) => deriveDocStatus(d) === "Expired").length;
  const expiring = live.filter((d) => deriveDocStatus(d) === "Expiring").length;
  const sub = `${live.length} tracked · ${expired} expired · ${expiring} expiring soon`;

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Documents & Compliance" sub={sub} />
      <DocumentsTable documents={documents} companies={companies} people={people} />
    </div>
  );
}
