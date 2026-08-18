// The Projects list screen (Phase 1 of the PES workbook rebuild).
//
// A server component: it reads the data, flattens each project into the plain
// row shape the list needs, and hands it to the client component. The derived
// figures (days remaining, days overdue, expected completion) are worked out in
// lib/projects.ts on every read — none of them is stored, so none can be stale.

import { PageHeader } from "@/components/ui";
import { ProjectsList, type ProjectRow } from "@/components/projects-list";
import { listProjects } from "@/lib/projects";
import { getSavedViewsFor } from "@/lib/saved-views";
import { isOpen } from "@/lib/projects-shared";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [items, { data: companyRows }, savedViews] = await Promise.all([
    listProjects(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    getSavedViewsFor("project"),
  ]);

  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  const rows: ProjectRow[] = items.map((p) => ({
    id: p.id,
    name: p.name,
    variant: p.variant,
    client: p.client,
    location: p.location,
    companyId: p.companyId,
    companyName: p.companyName,
    status: p.status,
    completionPct: p.completionPct,
    startDate: typeof p.startDate === "string" ? p.startDate : null,
    daysRemaining: p.programme.daysRemaining,
    daysOverdue: p.programme.daysOverdue,
    expectedCompletion: p.programme.expectedCompletion?.toISOString() ?? null,
  }));

  const open = rows.filter((r) => isOpen(r.status)).length;
  const late = rows.filter((r) => isOpen(r.status) && r.daysOverdue > 0).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        sub={`${rows.length} project${rows.length === 1 ? "" : "s"} · ${open} open${late ? ` · ${late} overdue` : ""}`}
      />
      <ProjectsList items={rows} companies={companies} savedViews={savedViews} />
    </div>
  );
}
