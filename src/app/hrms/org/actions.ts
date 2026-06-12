"use server";

import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";

/** Set (or clear) the head of a department within one company. */
export async function setDepartmentHead(companyId: number, departmentId: number, headPersonId: number | null) {
  await sb
    .from("department_heads")
    .upsert(
      { company_id: companyId, department_id: departmentId, head_person_id: headPersonId, updated_at: new Date().toISOString() },
      { onConflict: "company_id,department_id" }
    );
  revalidatePath("/hrms/org");
  revalidatePath(`/companies/${companyId}`);
}

/** One-tap: set (or clear) a person's primary Director (people.manager_id). */
export async function setPersonDirector(personId: number, managerId: number | null) {
  if (managerId === personId) return;
  await sb.from("people").update({ manager_id: managerId }).eq("id", personId);
  // If the new primary duplicates a dotted line, drop the dotted one.
  if (managerId != null) await sb.from("reporting_lines").delete().eq("person_id", personId).eq("manager_id", managerId);
  revalidatePath("/hrms/org");
  revalidatePath("/");
}

/** One-tap: add a secondary "also reports to" manager (dotted line). */
export async function addPersonManager(personId: number, managerId: number) {
  if (managerId === personId) return;
  const { data: p } = await sb.from("people").select("manager_id").eq("id", personId).maybeSingle();
  if ((p?.manager_id as number | null) === managerId) return; // already the primary
  await sb.from("reporting_lines").upsert({ person_id: personId, manager_id: managerId }, { onConflict: "person_id,manager_id" });
  revalidatePath("/hrms/org");
}
