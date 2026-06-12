import "server-only";
import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";

/**
 * Signed logo URLs for every company, keyed by id. One place so the company
 * photo renders the same everywhere (list, page header, drawer, brief).
 */
export async function getCompanyLogoMap(): Promise<Map<number, string>> {
  const { data } = await sb.from("companies").select("id,logo_path");
  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map((r) => (r.logo_path ? signDocumentFile(r.logo_path as string, 3600) : Promise.resolve(null)))
  );
  const map = new Map<number, string>();
  rows.forEach((r, i) => {
    if (signed[i]) map.set(r.id as number, signed[i] as string);
  });
  return map;
}

/** Signed logo URL for a single company (null when none set). */
export async function getCompanyLogoUrl(companyId: number): Promise<string | null> {
  const { data } = await sb.from("companies").select("logo_path").eq("id", companyId).maybeSingle();
  const path = (data?.logo_path as string | null) ?? null;
  return path ? signDocumentFile(path, 3600) : null;
}
