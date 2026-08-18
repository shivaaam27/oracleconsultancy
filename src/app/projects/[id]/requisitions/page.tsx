// The project's Requisitions tab (Phase 3) — request → approve → receive.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listRequisitions } from "@/lib/project-requisitions";
import { listRefs, namesOf } from "@/lib/project-refs";
import { num } from "@/lib/projects-shared";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectRequisitionsSheet, type BudgetItem } from "@/components/project-requisitions-sheet";

export const dynamic = "force-dynamic";

export default async function ProjectRequisitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, requisitions, refs] = await Promise.all([
    getProject(n), listBudgetLines(n), listRequisitions(n), listRefs(n),
  ]);
  if (!project) notFound();

  const budgetItems: BudgetItem[] = lines.map((l) => ({
    itemCode: l.itemCode, category: l.category, amount: num(l.amount) ?? 0,
  }));

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
      <ProjectTabs projectId={n} active="requisitions" />
      {budgetItems.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-elev p-6 text-center">
          <p className="text-[13px] font-medium">No budget yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-fg-subtle">
            A request has to point at a budget item, so the{" "}
            <Link href={`/projects/${n}/budget`} className="text-accent underline underline-offset-2">Budget tab</Link>{" "}
            comes first. That is deliberate: in the spreadsheet you can request against
            anything, which is one way its balances drift.
          </p>
        </div>
      ) : (
        <ProjectRequisitionsSheet
          projectId={n} requisitions={requisitions} budgetItems={budgetItems}
          routes={namesOf(refs, "route")} suppliers={namesOf(refs, "supplier")}
          currency={project.currency}
        />
      )}
    </div>
  );
}
