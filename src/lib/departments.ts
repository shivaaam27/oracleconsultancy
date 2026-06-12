import "server-only";
import { sb } from "@/db/supabase";

export type DeptHead = { companyId: number; departmentId: number; headPersonId: number | null };

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
