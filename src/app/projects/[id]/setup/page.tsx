// The project's Setup tab (Phase 7) — its reference lists, currency, and reset.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sb } from "@/db/supabase";
import { getProject } from "@/lib/projects";
import { listRefs } from "@/lib/project-refs";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectSetupSheet } from "@/components/project-setup-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — Projects" };

const COUNTED = [
  "project_budget_lines", "project_requisitions", "project_payments",
  "project_expenditures", "project_payment_stages", "project_site_people",
  "project_site_days",
];

export default async function ProjectSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const [project, refs, { data: others }] = await Promise.all([
    getProject(n), listRefs(n),
    sb.from("projects").select("id,name").neq("id", n).eq("archived", false).order("name"),
  ]);
  if (!project) notFound();

  // How much is on this project, so "discard" can name what it would remove.
  const counts: Record<string, number> = {};
  await Promise.all(COUNTED.map(async (t) => {
    const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("project_id", n);
    counts[t] = count ?? 0;
  }));

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
      <ProjectTabs projectId={n} active="setup" />
      <ProjectSetupSheet
        projectId={n}
        refs={refs}
        currency={project.currency}
        otherProjects={(others ?? []).map((p) => ({ id: p.id as number, name: p.name as string }))}
        counts={counts}
      />
    </div>
  );
}
