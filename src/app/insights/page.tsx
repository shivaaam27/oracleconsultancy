import { getAllTasks, type TaskRow } from "@/lib/tasks/queries";
import { sb } from "@/db/supabase";
import { computePersonKpi } from "@/lib/tasks/kpi";
import { computeWorkload } from "@/lib/tasks/workload";
import { StudioInsights, type StudioInsightsData, type InsightsSlice } from "@/components/studio/insights/studio-insights";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  "Not Started": "#B9BBBF", "In Progress": "#2490EF", "Under Review": "#8B5CF6", "Blocked": "#E0479E",
  "Waiting External": "#F5A524", "Escalated": "#F0703A", "Completed": "#19C37D", "Closed": "#5B5E63",
};
const PRIORITY_COLOR: Record<string, string> = { Critical: "#E0479E", High: "#F5A524", Medium: "#2490EF", Low: "#B9BBBF" };
const isOpen = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";
const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
const tasks = (q: string) => `/?tab=tasks&${q}`;

/**
 * Insights — Studio (26 Sept 2026, board Insights): the month's finishers, the
 * load on each person, open work by company and person, and the status and
 * priority mix. `?m=YYYY-MM` steps the "finished" half back through the months;
 * the open half is always now. Forecasts live on the Report.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const now = new Date(Date.now() + 3 * 3_600_000); // EAT
  const cur = { y: now.getUTCFullYear(), mo: now.getUTCMonth() + 1 };
  const asked = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  let y = asked ? Number(asked[1]) : cur.y, mo = asked ? Number(asked[2]) : cur.mo;
  if (y * 12 + mo > cur.y * 12 + cur.mo || mo < 1 || mo > 12) { y = cur.y; mo = cur.mo; }
  const key = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const prev = mo === 1 ? key(y - 1, 12) : key(y, mo - 1);
  const isCurrent = y === cur.y && mo === cur.mo;
  const next = mo === 12 ? key(y + 1, 1) : key(y, mo + 1);

  const [rows, { data: people }] = await Promise.all([
    getAllTasks(),
    sb.from("people").select("id,name,company_id,portal_role,director_company_id").eq("active", true),
  ]);

  // Finished this month — the KPI's own count; directors are excluded, as on the old page.
  const finished = (people ?? [])
    .filter((p) => p.portal_role !== "director" && p.director_company_id == null)
    .map((p) => ({ id: p.id as number, name: p.name as string, n: computePersonKpi(p.id as number, rows, y, mo).completed, href: tasks(`who=${p.id}&done=1`) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const monthStart = Date.UTC(y, mo - 1, 1) - 3 * 3_600_000, monthEnd = Date.UTC(y, mo, 1) - 3 * 3_600_000;
  const finishedTotal = rows.filter((r) => !isOpen(r) && r.closedDate && r.closedDate.getTime() >= monthStart && r.closedDate.getTime() < monthEnd).length;

  // The load now.
  const companyMeta = new Map<number, { name: string; accent: string | null }>();
  for (const r of rows) if (!companyMeta.has(r.companyId)) companyMeta.set(r.companyId, { name: r.companyName, accent: r.companyAccent });
  const wl = computeWorkload(rows, (people ?? []).map((p) => {
    const meta = p.company_id != null ? companyMeta.get(p.company_id as number) : undefined;
    return { id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null, companyName: meta?.name ?? null, companyAccent: meta?.accent ?? null };
  }));
  const loaded = wl.people.filter((p) => p.open > 0);
  const heaviest = loaded[0] ?? null;
  const mostLate = [...loaded].sort((a, b) => b.overdue - a.overdue)[0] ?? null;

  const open = rows.filter(isOpen);
  const byCo = new Map<number, { name: string; open: number; late: number }>();
  for (const r of open) {
    const e = byCo.get(r.companyId) ?? { name: r.companyName, open: 0, late: 0 };
    e.open++; if (isLate(r)) e.late++;
    byCo.set(r.companyId, e);
  }

  const status: InsightsSlice[] = Object.keys(STATUS_COLOR)
    .map((s) => ({ label: s, n: rows.filter((r) => r.status === s).length, color: STATUS_COLOR[s], href: tasks(`status=${encodeURIComponent(s)}`) }))
    .filter((s) => s.n > 0);
  const priority: InsightsSlice[] = Object.keys(PRIORITY_COLOR)
    .map((p) => ({ label: p, n: open.filter((r) => r.priority === p).length, color: PRIORITY_COLOR[p], href: tasks(`priority=${p}`) }))
    .filter((p) => p.n > 0);

  const d: StudioInsightsData = {
    monthLabel: new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    prevHref: `/insights?m=${prev}`,
    nextHref: isCurrent ? null : next === key(cur.y, cur.mo) ? "/insights" : `/insights?m=${next}`,
    finished,
    finishedTotal,
    openTotal: open.length,
    average: wl.average,
    heaviest: heaviest ? { name: heaviest.name, open: heaviest.open, late: heaviest.overdue, href: tasks(`who=${heaviest.id}`) } : null,
    aboveAverage: loaded.filter((p) => p.open > wl.average).length,
    mostLate: mostLate ? { name: mostLate.name, late: mostLate.overdue, open: mostLate.open } : null,
    byCompany: [...byCo.entries()].sort((a, b) => b[1].open - a[1].open).map(([id, c]) => ({ key: String(id), label: c.name, open: c.open, late: c.late, href: `/companies/${id}` })),
    byPerson: loaded.slice(0, 12).map((p) => ({ key: String(p.id), label: p.name.replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, ""), open: p.open, late: p.overdue, href: tasks(`who=${p.id}`) })),
    status,
    priority,
  };
  return <StudioInsights d={d} />;
}
