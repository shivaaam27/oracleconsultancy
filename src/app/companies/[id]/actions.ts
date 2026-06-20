"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { reindexEntity } from "@/lib/index-hooks";

type Result = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "logo";
}

/**
 * Save a company's core profile (the same `companies` columns Letters and
 * Letterheads read). One edit point for both — keep the field names in sync with
 * saveCompanyLetterheadAction in /letterheads/actions.ts.
 */
export async function saveCompanyProfileAction(companyId: number, fd: FormData): Promise<Result> {
  const incDate = str(fd, "incorporationDate");
  const patch: Record<string, unknown> = {
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

  // Display name — the `companies.name` every surface reads. Never blank it.
  const displayName = str(fd, "name");
  if (displayName) patch.name = displayName;

  // Company photo (logo) — reuses the letterhead logo_path so it stays one image
  // across Letters, the register and the report.
  const file = fd.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { ok: false, error: "Please choose an image file." };
    const path = `company-letterhead/${companyId}-logo-${Date.now()}-${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type || "image/png", upsert: true });
    if (upErr) return { ok: false, error: upErr.message };
    patch.logo_path = path;
  } else if (fd.get("remove_logo") === "1") {
    patch.logo_path = null;
  }

  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  // Best-effort semantic re-index (no-op unless semantic search is enabled).
  void reindexEntity("company", companyId);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/letters");
  revalidatePath("/brief");
  revalidatePath("/");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Company profile auto-fill from a document's contents (AI intake).   */
/* Mirrors enrichPersonProfile: blanks-only, never overwrites.         */
/* ------------------------------------------------------------------ */
export type CompanyProfileFields = {
  legalName?: string;
  registrationNo?: string;
  tin?: string;
  vrn?: string;
  incorporationDate?: string; // YYYY-MM-DD
  address?: string;
  phone?: string;
  email?: string;
};

const COMPANY_FIELD_COLUMNS: Record<keyof CompanyProfileFields, { col: string; label: string }> = {
  legalName: { col: "legal_name", label: "Legal name" },
  registrationNo: { col: "registration_no", label: "Registration no." },
  tin: { col: "tin", label: "TIN" },
  vrn: { col: "vrn", label: "VRN / VAT" },
  incorporationDate: { col: "incorporation_date", label: "Incorporation date" },
  address: { col: "address", label: "Address" },
  phone: { col: "phone", label: "Phone" },
  email: { col: "email", label: "Email" },
};

export async function enrichCompanyProfile(
  companyId: number,
  fields: CompanyProfileFields
): Promise<{ ok: true; filled: string[] } | { ok: false; error: string }> {
  try {
    const { data: company, error: readErr } = await sb
      .from("companies")
      .select("legal_name,registration_no,tin,vrn,incorporation_date,address,phone,email")
      .eq("id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!company) return { ok: false, error: "Company not found." };

    const patch: Record<string, unknown> = {};
    const filled: string[] = [];
    for (const key of Object.keys(COMPANY_FIELD_COLUMNS) as (keyof CompanyProfileFields)[]) {
      const value = fields[key]?.toString().trim();
      if (!value) continue;
      const { col, label } = COMPANY_FIELD_COLUMNS[key];
      if (company[col as keyof typeof company]) continue; // blanks-only
      patch[col] = key === "incorporationDate" ? new Date(value).toISOString() : value;
      filled.push(label);
    }
    if (filled.length === 0) return { ok: true, filled: [] };

    const { error } = await sb.from("companies").update(patch).eq("id", companyId);
    if (error) throw new Error(error.message);
    // Best-effort semantic re-index (no-op unless semantic search is enabled).
    void reindexEntity("company", companyId);
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/letters");
    // Parity with the person enrich path so the Documents centre + Home reflect
    // the updated company profile without a manual reload.
    revalidatePath("/documents");
    revalidatePath("/");
    return { ok: true, filled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the profile." };
  }
}
