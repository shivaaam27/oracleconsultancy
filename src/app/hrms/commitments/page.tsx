import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CommitmentsRegister } from "@/components/commitments-register";
import { listCommitments } from "@/lib/commitments";
import { commitmentUrgency } from "@/lib/commitments-shared";
import { getSavedViewsFor } from "@/lib/saved-views";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  const [items, { data: companyRows }, { data: docRows }, savedViews] = await Promise.all([
    listCommitments(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("documents").select("id,title,company_id").eq("archived", false).order("title"),
    getSavedViewsFor("commitment"),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const documents = (docRows ?? []).map((d) => ({ id: d.id as number, title: d.title as string, companyId: (d.company_id as number | null) ?? null }));
  const due = items.filter((c) => ["overdue", "soon"].includes(commitmentUrgency(c))).length;

  return (
    <div className="space-y-4">
      <HrmsCrumbs />
      <PageHeader
        title="Commitments register"
        sub={`${items.length} lease${items.length === 1 ? "" : "s"}/policies/contracts · ${due} need notice soon`}
      />
      <CommitmentsRegister items={items} companies={companies} documents={documents} savedViews={savedViews} />
    </div>
  );
}
