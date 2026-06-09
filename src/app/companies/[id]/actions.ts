"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";

type Result = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}

/**
 * Save a company's core profile (the same `companies` columns Letters and
 * Letterheads read). One edit point for both — keep the field names in sync with
 * saveCompanyLetterheadAction in /letterheads/actions.ts.
 */
export async function saveCompanyProfileAction(companyId: number, fd: FormData): Promise<Result> {
  const incDate = str(fd, "incorporationDate");
  const patch = {
    legal_name: str(fd, "legalName"),
    registration_no: str(fd, "registrationNo"),
    tin: str(fd, "tin"),
    vrn: str(fd, "vrn"),
    incorporation_date: incDate ? new Date(incDate).toISOString() : null,
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    signatory_name: str(fd, "signatoryName"),
    signatory_title: str(fd, "signatoryTitle"),
  };
  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/letterheads");
  return { ok: true };
}
