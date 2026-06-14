import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CommitmentsRegister } from "@/components/commitments-register";
import { listCommitments } from "@/lib/commitments";
import { commitmentUrgency } from "@/lib/commitments-shared";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  const [items, { data: companyRows }] = await Promise.all([
    listCommitments(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const due = items.filter((c) => ["overdue", "soon"].includes(commitmentUrgency(c))).length;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <HrmsCrumbs />
      <PageHeader
        title="Commitments register"
        sub={`${items.length} lease${items.length === 1 ? "" : "s"}/policies/contracts · ${due} need notice soon`}
      />
      <CommitmentsRegister items={items} companies={companies} />
    </div>
  );
}
