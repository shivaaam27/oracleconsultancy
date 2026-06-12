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
