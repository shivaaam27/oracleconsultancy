"use server";

import { sb } from "@/db/supabase";
import { revalidatePath, updateTag } from "next/cache";
import { wouldCreateReportingCycle } from "@/lib/org-chart";

/** Reporting changes touch the People directory + drawer, the
 *  per-company Org tab and the home dashboard — revalidate them all so none
 *  shows stale hierarchy after a one-tap change. */
function invalidateReporting() {
  
  revalidatePath("/people");
  revalidatePath("/companies", "layout");
  revalidatePath("/");
  updateTag("people");
}

/** Build a map of person → their current PRIMARY manager, for cycle checks. */
async function primaryManagerChain(): Promise<Map<number, number | null>> {
  const { data } = await sb.from("people").select("id,manager_id");
  const map = new Map<number, number | null>();
  for (const p of data ?? []) map.set(p.id as number, (p.manager_id as number | null) ?? null);
  return map;
}

/** Set (or clear) the head of a department within one company. */
export async function setDepartmentHead(companyId: number, departmentId: number, headPersonId: number | null) {
  await sb
    .from("department_heads")
    .upsert(
      { company_id: companyId, department_id: departmentId, head_person_id: headPersonId, updated_at: new Date().toISOString() },
      { onConflict: "company_id,department_id" }
    );
  
  revalidatePath(`/companies/${companyId}`);
}

/** Result of a one-tap reporting change. A rejected cycle returns a plain,
 *  owner-readable message so the picker can show it instead of closing silently
 *  (callers that ignore the result still compile). */
export type ReportingResult = { ok: true } | { ok: false; error: string };

/** Plain message shown when a change would loop the reporting chain. */
const CYCLE_MESSAGE = "That would make two people each other's manager.";

/** One-tap: set (or clear) a person's primary Director (people.manager_id).
 *  Refuses any change that would loop the reporting chain — the chart silently
 *  drops a cycle at render, which reads as "the app lost my change", so we never
 *  persist it and tell the user why instead. */
export async function setPersonDirector(personId: number, managerId: number | null): Promise<ReportingResult> {
  if (managerId === personId) return { ok: true };
  if (managerId != null) {
    const chain = await primaryManagerChain();
    if (wouldCreateReportingCycle(chain, personId, managerId)) return { ok: false, error: CYCLE_MESSAGE };
  }
  await sb.from("people").update({ manager_id: managerId }).eq("id", personId);
  // If the new primary duplicates a dotted line, drop the dotted one.
  if (managerId != null) await sb.from("reporting_lines").delete().eq("person_id", personId).eq("manager_id", managerId);
  invalidateReporting();
  return { ok: true };
}

/** One-tap: add a secondary "also reports to" manager (dotted line). */
export async function addPersonManager(personId: number, managerId: number): Promise<ReportingResult> {
  if (managerId === personId) return { ok: true };
  const { data: p } = await sb.from("people").select("manager_id").eq("id", personId).maybeSingle();
  if ((p?.manager_id as number | null) === managerId) return { ok: true }; // already the primary
  // A dotted "also reports to" that loops the primary chain (the new boss already
  // reports up to this person) would make them mutual managers — refuse it.
  const chain = await primaryManagerChain();
  if (wouldCreateReportingCycle(chain, personId, managerId)) return { ok: false, error: CYCLE_MESSAGE };
  await sb.from("reporting_lines").upsert({ person_id: personId, manager_id: managerId }, { onConflict: "person_id,manager_id" });
  invalidateReporting();
  return { ok: true };
}
