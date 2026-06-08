"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";

type Result = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "logo";
}

export type CompanyLetterhead = {
  id: number;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  registrationNo: string | null;
  tin: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
};

export async function listCompanyLetterheads(): Promise<CompanyLetterhead[]> {
  const { data } = await sb
    .from("companies")
    .select("id,name,legal_name,address,phone,email,registration_no,tin,logo_path,signatory_name,signatory_title")
    .order("name");
  const rows = data ?? [];
  // Sign logo URLs in parallel.
  const signed = await Promise.all(rows.map((r) => (r.logo_path ? signDocumentFile(r.logo_path as string, 3600) : Promise.resolve(null))));
  return rows.map((r, i) => ({
    id: r.id as number,
    name: r.name as string,
    legalName: (r.legal_name as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    registrationNo: (r.registration_no as string | null) ?? null,
    tin: (r.tin as string | null) ?? null,
    logoPath: (r.logo_path as string | null) ?? null,
    logoUrl: signed[i],
    signatoryName: (r.signatory_name as string | null) ?? null,
    signatoryTitle: (r.signatory_title as string | null) ?? null,
  }));
}

/** Save a company's letterhead fields (+ optional logo upload). */
export async function saveCompanyLetterheadAction(companyId: number, fd: FormData): Promise<Result> {
  const patch: Record<string, unknown> = {
    legal_name: str(fd, "legalName"),
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    registration_no: str(fd, "registrationNo"),
    tin: str(fd, "tin"),
    signatory_name: str(fd, "signatoryName"),
    signatory_title: str(fd, "signatoryTitle"),
  };

  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const path = `company-logos/${companyId}-${Date.now()}-${safeName(logo.name)}`;
    const buffer = Buffer.from(await logo.arrayBuffer());
    const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: logo.type || "image/png", upsert: true });
    if (error) return { ok: false, error: error.message };
    patch.logo_path = path;
  } else if (fd.get("removeLogo") === "1") {
    patch.logo_path = null;
  }

  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/letterheads");
  return { ok: true };
}
