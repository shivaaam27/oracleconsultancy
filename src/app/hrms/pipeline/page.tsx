import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { PipelineBoard } from "@/components/pipeline-board";
import { listPipeline } from "@/lib/pipeline";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [items, { data: companyRows }, { data: docRows }] = await Promise.all([
    listPipeline(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("documents").select("id,title,company_id").eq("archived", false).order("title"),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const documents = (docRows ?? []).map((d) => ({ id: d.id as number, title: d.title as string, companyId: (d.company_id as number | null) ?? null }));
  const open = items.filter((i) => i.stage !== "Issued").length;

  return (
    <div className="space-y-4">
      <HrmsCrumbs />
      <PageHeader
        title="Applications in progress"
        sub={`${items.length} case${items.length === 1 ? "" : "s"} · ${open} still in progress`}
      />
      <PipelineBoard items={items} companies={companies} documents={documents} />
    </div>
  );
}
