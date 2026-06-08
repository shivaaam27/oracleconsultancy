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

export type LetterheadMode = "typed" | "images" | "background";

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
  mode: LetterheadMode;
  headerImageUrl: string | null;
  footerImageUrl: string | null;
  backgroundImageUrl: string | null;
  hasHeader: boolean;
  hasFooter: boolean;
  hasBackground: boolean;
  contentTopMm: number | null;
  contentBottomMm: number | null;
};

export async function listCompanyLetterheads(): Promise<CompanyLetterhead[]> {
  const { data } = await sb
    .from("companies")
    .select("id,name,legal_name,address,phone,email,registration_no,tin,logo_path,signatory_name,signatory_title,letterhead_mode,header_image_path,footer_image_path,background_image_path,content_top_mm,content_bottom_mm")
    .order("name");
  const rows = data ?? [];
  const sign = (p: unknown) => (p ? signDocumentFile(p as string, 3600) : Promise.resolve(null));
  const [logos, headers, footers, backgrounds] = await Promise.all([
    Promise.all(rows.map((r) => sign(r.logo_path))),
    Promise.all(rows.map((r) => sign(r.header_image_path))),
    Promise.all(rows.map((r) => sign(r.footer_image_path))),
    Promise.all(rows.map((r) => sign(r.background_image_path))),
  ]);
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
    logoUrl: logos[i],
    signatoryName: (r.signatory_name as string | null) ?? null,
    signatoryTitle: (r.signatory_title as string | null) ?? null,
    mode: ((r.letterhead_mode as string | null) ?? "typed") as LetterheadMode,
    headerImageUrl: headers[i],
    footerImageUrl: footers[i],
    backgroundImageUrl: backgrounds[i],
    hasHeader: !!r.header_image_path,
    hasFooter: !!r.footer_image_path,
    hasBackground: !!r.background_image_path,
    contentTopMm: (r.content_top_mm as number | null) ?? null,
    contentBottomMm: (r.content_bottom_mm as number | null) ?? null,
  }));
}

/** Save a company's letterhead fields (+ optional logo upload). */
export async function saveCompanyLetterheadAction(companyId: number, fd: FormData): Promise<Result> {
  const mode = str(fd, "letterheadMode") ?? "typed";
  const patch: Record<string, unknown> = {
    legal_name: str(fd, "legalName"),
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    registration_no: str(fd, "registrationNo"),
    tin: str(fd, "tin"),
    signatory_name: str(fd, "signatoryName"),
    signatory_title: str(fd, "signatoryTitle"),
    letterhead_mode: ["typed", "images", "background"].includes(mode) ? mode : "typed",
    content_top_mm: ((): number | null => { const v = (fd.get("contentTopMm") ?? "").toString().trim(); return v ? Number(v) : null; })(),
    content_bottom_mm: ((): number | null => { const v = (fd.get("contentBottomMm") ?? "").toString().trim(); return v ? Number(v) : null; })(),
  };

  // Handle each uploadable image (field name → db column).
  const uploads: Array<[string, string]> = [
    ["logo", "logo_path"],
    ["headerImage", "header_image_path"],
    ["footerImage", "footer_image_path"],
    ["backgroundImage", "background_image_path"],
  ];
  for (const [field, col] of uploads) {
    const file = fd.get(field);
    if (file instanceof File && file.size > 0) {
      const path = `company-letterhead/${companyId}-${field}-${Date.now()}-${safeName(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: file.type || "image/png", upsert: true });
      if (error) return { ok: false, error: error.message };
      patch[col] = path;
    } else if (fd.get(`remove_${field}`) === "1") {
      patch[col] = null;
    }
  }

  const { error } = await sb.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/letterheads");
  return { ok: true };
}
