import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { PipelineBoard } from "@/components/pipeline-board";
import { listPipeline } from "@/lib/pipeline";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [items, { data: companyRows }] = await Promise.all([
    listPipeline(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const open = items.filter((i) => i.stage !== "Issued").length;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <HrmsCrumbs />
      <PageHeader
        title="Applications in progress"
        sub={`${items.length} case${items.length === 1 ? "" : "s"} · ${open} still in progress`}
      />
      <PipelineBoard items={items} companies={companies} />
    </div>
  );
}
