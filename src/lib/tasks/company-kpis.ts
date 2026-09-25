import { isOpen } from "./derive";
import type { TaskRow, CompanyKpi } from "./queries";

/**
 * A company's tasks are the tasks FILED UNDER that company — `task.companyId`,
 * nothing else.
 *
 * ⚠️ Until Sept 2026 the Companies hub and the company page also counted every
 * task whose owner or assignee merely WORKS FOR the company. Three people belong
 * to 8–12 companies each (Jitesh, Shivam, Pulin), so their whole workload landed
 * on every one of them: V1 Supermarket showed 59 open when 11 are really filed
 * there, and Cocofix Payment (a Furaha task) was listed as a V1 task. The
 * Director Brief and the Tasks list always used the filed company, which is why
 * the numbers disagreed. People's company links still decide who SEES what
 * (portal scope, pickers) — they just don't decide where a task is counted.
 */
export function tasksOfCompany(rows: TaskRow[], companyId: number): TaskRow[] {
  return rows.filter((r) => r.companyId === companyId);
}

/** One KPI card per company in `companies` (task-less companies included),
 *  counting each task once, under the company it is filed under. */
export function computeCompanyKpisForCompanies(
  rows: TaskRow[],
  companies: Array<{ id: number; name: string; accent: string | null }>,
): CompanyKpi[] {
  const byCompany = new Map<number, TaskRow[]>();
  for (const c of companies) byCompany.set(c.id, []);
  for (const r of rows) byCompany.get(r.companyId)?.push(r); // unknown/inactive company: ignored
  return companies
    .map((c) => {
      const list = byCompany.get(c.id) ?? [];
      const total = list.length;
      const overdue = list.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
      const blocked = list.filter((r) => r.status === "Blocked").length;
      const aging = list.filter((r) => r.flag === "aging").length;
      return {
        id: c.id,
        name: c.name,
        total,
        open: list.filter((r) => isOpen(r.status)).length,
        inProgress: list.filter((r) => r.status === "In Progress").length,
        overdue,
        dueSoon: list.filter((r) => r.flag === "due-soon").length,
        blocked,
        critical: list.filter((r) => r.priority === "Critical" && isOpen(r.status)).length,
        escalated: list.filter((r) => r.status === "Escalated").length,
        completed: list.filter((r) => r.status === "Completed").length,
        closed: list.filter((r) => r.status === "Closed").length,
        aging,
        riskScore: total === 0 ? 0 : Math.round(((overdue * 3 + blocked * 2 + aging) / total) * 100),
        accent: c.accent,
      } satisfies CompanyKpi;
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}
