"use server";

import { revalidatePath } from "next/cache";
import { setCompanyComplianceTracked } from "@/lib/compliance-tracking";

/** Toggle whether a company is held to the statutory compliance checklist. */
export async function setCompanyComplianceTrackedAction(
  companyId: number,
  tracked: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await setCompanyComplianceTracked(companyId, tracked);
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update tracking." };
  }
}
