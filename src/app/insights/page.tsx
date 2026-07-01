import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllTasks, statusBreakdown, priorityBreakdown, type TaskRow } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { sb } from "@/db/supabase";
import { computePersonKpi } from "@/lib/kpi";
import { KpiLeaderboard, type KpiBoardPerson } from "@/components/kpi-leaderboard";

/** Build the monthly KPI leaderboard data (last 4 months) for active, non-director
 *  staff. Directors are excluded (they set the work, not deliver it). */
async function buildKpiBoard(rows: TaskRow[]): Promise<KpiBoardPerson[]> {
  const { data: people } = await sb
    .from("people")
    .select("id,name,active,portal_role,director_company_id")
    .eq("active", true);
  const now = new Date();
  const board: KpiBoardPerson[] = [];
  for (const p of people ?? []) {
    if (p.portal_role === "director" || p.director_company_id != null) continue; // excluded
    const months = Array.from({ length: 4 }, (_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = computePersonKpi(p.id as number, rows, dt.getFullYear(), dt.getMonth() + 1);
      return { monthLabel: k.monthLabel, completed: k.completed, openInvolved: k.openInvolved, score: k.score };
    });
    const anyActivity = months.some((m) => m.completed || m.openInvolved);
    if (anyActivity) board.push({ personId: p.id as number, name: p.name as string, role: (p.portal_role as string | null) ?? null, months });
  }
  return board;
}

export const dynamic = "force-dynamic";

function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "danger" | "warn" | "success" | "info" }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const bg = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : tone === "success" ? "bg-success" : tone === "info" ? "bg-info" : "bg-accent";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
        <div className={`${bg} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-fg-muted w-8 text-right tabular">{value}</div>
    </div>
  );
}

function statusTone(s: string): "accent" | "danger" | "warn" | "success" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "accent";
}

export default async function InsightsPage() {
  const rows = await getAllTasks();
  const kpiBoard = await buildKpiBoard(rows);
  const isOpenRow = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";

  const statuses = statusBreakdown(rows);
  const priorities = priorityBreakdown(rows);
  const maxStatus = Math.max(...statuses.map((s) => s.count), 1);
  const maxPrio = Math.max(...priorities.map((p) => p.count), 1);

  const companyAgg = new Map<number, { name: string; open: number; overdue: number }>();
  for (const r of rows) {
    if (!isOpenRow(r)) continue;
    const cur = companyAgg.get(r.companyId) ?? { name: r.companyName, open: 0, overdue: 0 };
    cur.open += 1;
    if (r.flag === "overdue" || r.flag === "escalate-now") cur.overdue += 1;
    companyAgg.set(r.companyId, cur);
  }
  const companyRows = [...companyAgg.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.open - a.open);
  const maxCompanyOpen = Math.max(...companyRows.map((c) => c.open), 1);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <HrmsCrumbs />
      <PageHeader title="Insights" sub="How your tasks are spread across companies, status and priority. (Forecasts — leave, renewals, probations — live on the Director Brief.)" />

      <KpiLeaderboard board={kpiBoard} />

      <Link
        href="/brief"
        className="glass elevated rounded-2xl px-4 py-3 flex items-center gap-3 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md group"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Looking for forecasts?</span>
          <span className="block text-[13px] text-fg-muted">Leave, renewals and probations now live on the Director Brief.</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-fg-muted group-hover:text-accent transition-colors shrink-0">
          Open Brief <ArrowRight size={15} />
        </span>
      </Link>

      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">Open by company</p>
        <div className="glass elevated rounded-2xl p-4 space-y-2.5">
          {companyRows.length === 0 ? (
            <p className="text-sm text-fg-muted py-2">No open tasks. 🎉</p>
          ) : companyRows.map((c) => (
            <CompanyDrawerLink key={c.id} id={c.id} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm group w-full text-left">
              <div className="truncate text-fg group-hover:text-accent transition-colors">{c.name}</div>
              <Bar value={c.open} max={maxCompanyOpen} />
              {c.overdue > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger shrink-0">{c.overdue} overdue</span>}
            </CompanyDrawerLink>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2 px-1">Status distribution</p>
          <div className="glass elevated rounded-2xl p-4 space-y-2.5">
            {statuses.map((s) => (
              <div key={s.status} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{s.status}</div>
                <Bar value={s.count} max={maxStatus} tone={statusTone(s.status)} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2 px-1">Priority breakdown</p>
          <div className="glass elevated rounded-2xl p-4 space-y-2.5">
            {priorities.map((p) => (
              <div key={p.priority} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{p.priority}</div>
                <Bar value={p.count} max={maxPrio} tone={p.priority === "Critical" ? "danger" : p.priority === "High" ? "warn" : p.priority === "Medium" ? "info" : "accent"} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
