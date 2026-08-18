// The project's Cash tab (Phase 4) — money released, money spent, and the gap.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listBudgetLines } from "@/lib/project-budget";
import { listPayments, listExpenditures } from "@/lib/project-cash";
import { listRequisitions } from "@/lib/project-requisitions";
import { listRefs, namesOf } from "@/lib/project-refs";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectCashSheet } from "@/components/project-cash-sheet";

export const dynamic = "force-dynamic";

export default async function ProjectCashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, lines, payments, expenditures, requisitions, refs] = await Promise.all([
    getProject(n), listBudgetLines(n), listPayments(n), listExpenditures(n),
    listRequisitions(n), listRefs(n),
  ]);
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
      <ProjectTabs projectId={n} active="cash" />
      <ProjectCashSheet
        projectId={n}
        payments={payments}
        expenditures={expenditures}
        itemCodes={lines.map((l) => l.itemCode)}
        /* Only what is needed to work out an invoice total from the money head
           office approved — not the whole requisition. */
        requisitions={requisitions.map((r) => ({
          referenceNo: r.referenceNo, batchNo: r.batchNo, route: r.route,
          amountApproved: r.amountApproved, status: r.status,
        }))}
        floatHolders={namesOf(refs, "float_holder")}
        suppliers={namesOf(refs, "supplier")}
        currency={project.currency}
      />
    </div>
  );
}
