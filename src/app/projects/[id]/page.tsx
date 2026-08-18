// One project — the record screen (Phase 1).
//
// A record is a PAGE with its own URL (`/projects/12`), which is the owner's
// decision recorded in CLAUDE.md: "A record is a PAGE with its own URL … never
// `?task=`". So this is linkable, bookmarkable and shareable.
//
// This is the workbook's SNAPSHOT header and money block, rebuilt. What it
// deliberately does NOT yet show is the budget-versus-expenditure gauge and the
// payment plan — those need the bill of quantities (Phase 2) and the ledgers
// (Phase 4). Rather than leave silent gaps, the page names what is missing and
// which phase brings it.

import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { ProjectRecord } from "@/components/project-record";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const p = await getProject(n);
  if (!p) notFound();

  // Everything crossing into the client component is a plain, serialisable
  // value — Dates become ISO strings here rather than in the component.
  return (
    <ProjectRecord
      project={{
        id: p.id,
        name: p.name,
        variant: p.variant,
        client: p.client,
        location: p.location,
        companyName: p.companyName,
        poNumber: p.poNumber,
        status: p.status,
        notes: p.notes,
        archived: p.archived,
        startDate: typeof p.startDate === "string" ? p.startDate : null,
        durationDays: p.durationDays,
        quotationValue: p.quotationValue as string | null,
        poValue: p.poValue as string | null,
        additionalWork: p.additionalWork as string | null,
        vatRate: p.vatRate as string | null,
        whtRate: p.whtRate as string | null,
        completionPct: p.completionPct as string | null,
        mealRate: p.mealRate,
        currency: p.currency,
      }}
      programme={{
        expectedCompletion: p.programme.expectedCompletion?.toISOString() ?? null,
        daysElapsed: p.programme.daysElapsed,
        daysRemaining: p.programme.daysRemaining,
        daysOverdue: p.programme.daysOverdue,
        timeElapsedPct: p.programme.timeElapsedPct,
      }}
      contract={p.contract}
    />
  );
}
