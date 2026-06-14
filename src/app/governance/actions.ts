"use server";

import { getCompanyGovernance, type CompanyGovernance } from "@/lib/governance";

/** Load one company's governance (cap table / signatories / resolutions). */
export async function loadCompanyGovernance(companyId: number): Promise<CompanyGovernance> {
  return getCompanyGovernance(companyId);
}
