// The project's Snapshot tab (Phase 5) — the dashboard.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listPayments, listExpenditures } from "@/lib/project-cash";
import { listPaymentStages } from "@/lib/project-site";
import { groupByCategory } from "@/lib/project-budget-shared";
import { num } from "@/lib/projects-shared";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectSnapshotSheet } from "@/components/project-snapshot-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Snapshot — Projects" };

export default async function ProjectSnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, payments, expenditures, stages] = await Promise.all([
    getProject(n), listBudgetLines(n), listPayments(n), listExpenditures(n), listPaymentStages(n),
  ]);
  if (!project) notFound();

  // Spend rolled up to the CATEGORY of the budget line it points at. Spending
  // with no item code cannot be attributed to a category and is deliberately
  // left out of the gauge — it is counted in the Cash tab's totals instead.
  const categoryOf = new Map(lines.map((l) => [l.itemCode, l.category]));
  const spentByCategory = new Map<string, number>();
  for (const e of expenditures) {
    if (!e.itemCode) continue;
    const cat = categoryOf.get(e.itemCode);
    if (!cat) continue;
    spentByCategory.set(cat, (spentByCategory.get(cat) ?? 0) + (num(e.amount) ?? 0));
  }

  const budgetByCategory = groupByCategory(lines).map((c) => ({ category: c.category, amount: c.amount }));
  const budgetTotal = lines.length ? lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0) : null;
  const spentTotal = expenditures.length ? expenditures.reduce((s, e) => s + (num(e.amount) ?? 0), 0) : null;
  const releasedTotal = payments.reduce((s, p) => s + (num(p.amountPaid) ?? 0), 0);

  return (
    <div className="space-y-3">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={13} /> Projects
      </Link>
      <div>
        <h1 className="text-[19px] font-medium">{project.name}</h1>
        <p className="text-sm text-fg-muted">
          {[project.variant, project.client, project.companyName].filter(Boolean).join(" · ")}
        </p>
      </div>
      <ProjectTabs projectId={n} active="snapshot" />
      <ProjectSnapshotSheet
        projectId={n}
        budgetByCategory={budgetByCategory}
        spentByCategory={[...spentByCategory.entries()]}
        stages={stages}
        totalContract={project.contract.totalContract}
        completionPct={num(project.completionPct)}
        budgetTotal={budgetTotal}
        spentTotal={spentTotal}
        releasedTotal={releasedTotal}
        quotationValue={num(project.quotationValue)}
      />
    </div>
  );
}
