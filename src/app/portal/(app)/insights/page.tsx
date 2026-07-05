import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import type { Tone } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds, seesAllCompanies, colleagueCompanyScope } from "@/lib/portal-auth";
import { getAllTasks, statusBreakdown, priorityBreakdown, type TaskRow } from "@/lib/queries";
import { PortalInsights, type Segment, type CompanyOpen } from "@/components/portal-insights";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights — Oracle Consultancy" };

/** Tasks that are still live (anything except Completed/Closed). */
function isOpenRow(r: TaskRow): boolean {
  return r.status !== "Completed" && r.status !== "Closed";
}

/** A task that is past its deadline / flagged for escalation. */
function isOverdueRow(r: TaskRow): boolean {
  return r.flag === "overdue" || r.flag === "escalate-now";
}

function statusTone(s: string): Tone {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "accent";
}

function priorityTone(p: string): Tone {
  return p === "Critical" ? "danger" : p === "High" ? "warn" : p === "Medium" ? "info" : "accent";
}

export default async function PortalInsightsPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Insights visibility is owner-configurable per role (Settings → Portals).
  if (!me.caps.navInsights) redirect("/portal");

  const groupWide = seesAllCompanies(me);

  // Always derive from the SAME source the admin command centre uses, then scope.
  //  - director / HR: the whole portfolio (group-wide).
  //  - manager: only their visible set (own + team + their companies' tasks),
  //    and the by-company chart is limited to their own companies.
  const allRows = await getAllTasks();
  let rows: TaskRow[];
  let companyAllow: Set<number> | null = null;
  if (groupWide) {
    rows = allRows.filter((r) => !r.archived);
  } else {
    const ids = new Set(await visibleTaskIds(me));
    // Belonging scope (staff → their own companies) so the by-company chart isn't
    // empty for staff. Safe: `rows` is already limited to the viewer's visible tasks.
    companyAllow = new Set((await colleagueCompanyScope(me)) ?? []);
    rows = allRows.filter((r) => ids.has(r.id) && !r.archived);
  }

  // Headline counts (open / overdue) over the scoped set.
  const openRows = rows.filter(isOpenRow);
  const openTotal = openRows.length;
  const overdueTotal = openRows.filter(isOverdueRow).length;

  // Status + priority distributions over the scoped set.
  const statuses: Segment[] = statusBreakdown(rows).map((s) => ({
    label: s.status,
    count: s.count,
    tone: statusTone(s.status),
  }));
  const priorities: Segment[] = priorityBreakdown(rows).map((p) => ({
    label: p.priority,
    count: p.count,
    tone: priorityTone(p.priority),
  }));

  // Open-by-company bar list. For managers, restrict to their own companies so
  // they never glimpse another company's volumes; group-wide roles see all.
  const companyAgg = new Map<number, { name: string; open: number; overdue: number }>();
  for (const r of openRows) {
    if (companyAllow && !companyAllow.has(r.companyId)) continue;
    const cur = companyAgg.get(r.companyId) ?? { name: r.companyName, open: 0, overdue: 0 };
    cur.open += 1;
    if (isOverdueRow(r)) cur.overdue += 1;
    companyAgg.set(r.companyId, cur);
  }
  const companies: CompanyOpen[] = [...companyAgg.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.open - a.open);

  const scopeNote = groupWide
    ? "Across all companies."
    : "Your company, team and your own tasks.";

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={60} />
      <Reveal delay={0}>
        <Hero title="Insights" subtitle={scopeNote}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <BarChart3 size={15} /> {openTotal} open · {overdueTotal} overdue
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <PortalInsights
          openTotal={openTotal}
          overdueTotal={overdueTotal}
          statuses={statuses}
          priorities={priorities}
          companies={companies}
        />
      </Reveal>
    </div>
  );
}
