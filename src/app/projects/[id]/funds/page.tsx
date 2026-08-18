// The project's Funds tab — the workbook's FUNDS ANALYSIS sheet.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listRequisitions } from "@/lib/project-requisitions";
import { fundsByBatch } from "@/lib/project-funds-shared";
import { num } from "@/lib/projects-shared";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectFundsSheet } from "@/components/project-funds-sheet";

export const dynamic = "force-dynamic";

export default async function ProjectFundsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, requisitions] = await Promise.all([
    getProject(n), listBudgetLines(n), listRequisitions(n),
  ]);
  if (!project) notFound();

  // Null, not 0, when there is no budget — an unknown must not render as a number.
  const budget = lines.length ? lines.reduce((s, l) => s + (num(l.amount) ?? 0), 0) : null;

  const funds = fundsByBatch(
    requisitions.map((r) => ({
      batchNo: r.batchNo,
      amountRequested: r.amountRequested,
      amountApproved: r.amountApproved,
      amountReceived: r.amountReceived,
      requestedDate: r.requestedDate,
      status: r.status,
    })),
    budget,
  );

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
      <ProjectTabs projectId={n} active="funds" />
      <ProjectFundsSheet funds={funds} budget={budget} currency={project.currency} />
    </div>
  );
}
