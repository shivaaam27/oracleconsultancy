// The project's Site tab (Phase 6) — the meals and labour tick-sheets.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listExpenditures } from "@/lib/project-cash";
import { listSitePeople, listSiteDays } from "@/lib/project-site";
import { listRefs, namesOf } from "@/lib/project-refs";
import { groupByCategory } from "@/lib/project-budget-shared";
import { num } from "@/lib/projects-shared";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectSiteSheet } from "@/components/project-site-sheet";

export const dynamic = "force-dynamic";

export default async function ProjectSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, people, days, lines, expenditures, refs] = await Promise.all([
    getProject(n), listSitePeople(n), listSiteDays(n), listBudgetLines(n), listExpenditures(n), listRefs(n),
  ]);
  if (!project) notFound();

  // Both budgets are matched BY CATEGORY NAME — the fault this replaces is the
  // workbook pointing at fixed rows of a sorted gauge.
  const budgetByCategory = groupByCategory(lines).map((c) => [c.category, c.amount] as [string, number]);
  const categoryOf = new Map(lines.map((l) => [l.itemCode, l.category]));
  const spent = new Map<string, number>();
  for (const e of expenditures) {
    const cat = e.itemCode ? categoryOf.get(e.itemCode) : undefined;
    if (!cat) continue;
    spent.set(cat, (spent.get(cat) ?? 0) + (num(e.amount) ?? 0));
  }

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
      <ProjectTabs projectId={n} active="site" />
      <ProjectSiteSheet
        projectId={n}
        people={people}
        days={days}
        mealRate={num(project.mealRate)}
        budgetByCategory={budgetByCategory}
        spentByCategory={[...spent.entries()]}
        startDate={typeof project.startDate === "string" ? project.startDate.slice(0, 10) : null}
        designations={namesOf(refs, "designation")}
        currency={project.currency}
      />
    </div>
  );
}
