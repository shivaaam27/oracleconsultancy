// The project's Budget tab — the Bill of Quantities (Phase 2).
//
// A record is a page with its own URL, so the budget is /projects/12/budget
// rather than a query parameter. The overview at /projects/12 reads the same
// lines to work out profit, which is why adding a line here changes the margin
// there.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listRefs, namesOf } from "@/lib/project-refs";
import { num } from "@/lib/projects-shared";
import { ProjectBudgetSheet } from "@/components/project-budget-sheet";
import { ProjectTabs } from "@/components/project-tabs";

export const dynamic = "force-dynamic";

export default async function ProjectBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, refs] = await Promise.all([getProject(n), listBudgetLines(n), listRefs(n)]);
  if (!project) notFound();

  return (
    <div className="space-y-3">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg">
        <ArrowLeft size={13} /> Projects
      </Link>

      <div>
        <h1 className="text-[19px] font-medium">{project.name}</h1>
        <p className="text-[12px] text-fg-muted">
          {[project.variant, project.client, project.companyName].filter(Boolean).join(" · ")}
        </p>
      </div>

      <ProjectTabs projectId={n} active="budget" />

      <ProjectBudgetSheet
        projectId={n}
        lines={lines}
        quotationValue={num(project.quotationValue)}
        categoryOptions={namesOf(refs, "category")}
        subJobOptions={namesOf(refs, "sub_job")}
        currency={project.currency}
      />
    </div>
  );
}
