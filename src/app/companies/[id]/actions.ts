"use server";

import { guardOwner } from "@/lib/viewer";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin-auth"; // every action checks for the owner itself (audit 24 Sept 2026)
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
 * company branding fields used across the app.
 */
export async function saveCompanyProfileAction(companyId: number, fd: FormData): Promise<Result> {
  await guardOwner();
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const incDate = str(fd, "incorporationDate");
  const patch: Record<string, unknown> = {
    // Brand file prefix for document naming (DarSpices, PES…). Strip spaces/punct
    // so it stays filename-safe even if typed with spaces.
    file_prefix: (str(fd, "filePrefix") ?? "").replace(/[^A-Za-z0-9]/g, "") || null,
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
    // (sector_regulated is no longer written: it only fed the required-documents
    // checklist, which was removed in Aug 2026 — nothing reads it.)
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
  // so it reflects what THIS company actually needs. Best-effort.
  // Best-effort semantic re-index (no-op unless semantic search is enabled).
  void reindexEntity("company", companyId);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");

  revalidatePath("/brief");
  revalidatePath("/");
  return { ok: true };
}
