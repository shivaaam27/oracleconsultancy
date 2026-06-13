import "server-only";
import { sb } from "@/db/supabase";

export type DeptHead = { companyId: number; departmentId: number; headPersonId: number | null };

export type DepartmentAdminRow = {
  id: number;
  name: string;
  /** Active people in this department. */
  peopleCount: number;
  /** Distinct companies that have people in this department. */
  companyCount: number;
  /** Tasks tagged to this department. */
  taskCount: number;
  /** Per-company heads set for this department. */
  headCount: number;
};

/** Departments with usage counts, for the admin screen (rename/merge/delete). */
export async function getDepartmentsAdmin(): Promise<DepartmentAdminRow[]> {
  const [{ data: depts }, { data: ppl }, { data: heads }, { data: taskRows }] = await Promise.all([
    sb.from("departments").select("id,name").order("name"),
    sb.from("people").select("department_id,company_id,active"),
    sb.from("department_heads").select("department_id,head_person_id"),
    sb.from("tasks").select("department_id").eq("archived", false),
  ]);
  const byDept = new Map<number, { count: number; companies: Set<number> }>();
  for (const p of ppl ?? []) {
    const d = p.department_id as number | null;
    if (d == null || !(p.active ?? true)) continue;
    const e = byDept.get(d) ?? { count: 0, companies: new Set<number>() };
    e.count++;
    if (p.company_id != null) e.companies.add(p.company_id as number);
    byDept.set(d, e);
  }
  const headCount = new Map<number, number>();
  for (const h of heads ?? []) if (h.head_person_id != null) headCount.set(h.department_id as number, (headCount.get(h.department_id as number) ?? 0) + 1);
  const taskCount = new Map<number, number>();
  for (const t of taskRows ?? []) { const d = t.department_id as number | null; if (d != null) taskCount.set(d, (taskCount.get(d) ?? 0) + 1); }

  return (depts ?? []).map((d) => ({
    id: d.id as number,
    name: d.name as string,
    peopleCount: byDept.get(d.id as number)?.count ?? 0,
    companyCount: byDept.get(d.id as number)?.companies.size ?? 0,
    taskCount: taskCount.get(d.id as number) ?? 0,
    headCount: headCount.get(d.id as number) ?? 0,
  }));
}

/** All per-company department heads, keyed `${companyId}:${departmentId}`. */
export async function getDepartmentHeads(): Promise<Record<string, number>> {
  const { data } = await sb.from("department_heads").select("company_id,department_id,head_person_id");
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const hp = r.head_person_id as number | null;
    if (hp != null) out[`${r.company_id}:${r.department_id}`] = hp;
  }
  return out;
}
