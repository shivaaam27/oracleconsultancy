// The project History tab — the audit trail.
//
// Item 6 of the agreed order. It answers the question the spreadsheet cannot:
// who changed this figure, when, and what was it before?

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { listProjectAudit } from "@/lib/project-audit";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectHistorySheet } from "@/components/project-history-sheet";

export const dynamic = "force-dynamic";

export default async function ProjectHistoryPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sheet?: string }>;
}) {
  const { id } = await params;
  const { sheet } = await searchParams;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const project = await getProject(n);
  if (!project) notFound();

  // Read the whole trail once and filter here: the counts on the rail have to
  // come from everything, not from the filtered slice, or the numbers would
  // change every time you clicked one.
  const all = await listProjectAudit(n, { limit: 2000 });
  const counts: Record<string, number> = {};
  for (const r of all) counts[r.entity] = (counts[r.entity] ?? 0) + 1;
  const rows = sheet ? all.filter((r) => r.entity === sheet) : all;

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

      <ProjectTabs projectId={n} active="history" />

      <ProjectHistorySheet rows={rows} sheet={sheet ?? null} counts={counts} />
    </div>
  );
}
