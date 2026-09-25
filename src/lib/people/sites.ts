import { cache } from "react";
import { sb } from "@/db/supabase";

/** Active site/location names (shared list for people work-site/residence). */
export const listSiteNames = cache(async (): Promise<string[]> => {
  const { data } = await sb.from("sites").select("name").eq("active", true).order("name");
  return (data ?? []).map((s) => s.name as string);
});

/** id → name map for resolving a person's work-site / residence. */
export const siteNameMap = cache(async (): Promise<Map<number, string>> => {
  const { data } = await sb.from("sites").select("id,name");
  return new Map((data ?? []).map((s) => [s.id as number, s.name as string]));
});

export type SiteAdminRow = { id: number; name: string; workCount: number; residenceCount: number };

/** Sites with usage counts (people based here / living here), for the admin. */
export const getSitesAdmin = cache(async (): Promise<SiteAdminRow[]> => {
  const [{ data: rows }, { data: ppl }] = await Promise.all([
    sb.from("sites").select("id,name").order("name"),
    sb.from("people").select("work_site_id,residence_site_id,active"),
  ]);
  const work = new Map<number, number>();
  const res = new Map<number, number>();
  // Count everyone (incl. archived) — merge/delete re-points all matching people,
  // so the count should reflect exactly who the action will touch.
  for (const p of ppl ?? []) {
    const w = p.work_site_id as number | null; if (w != null) work.set(w, (work.get(w) ?? 0) + 1);
    const r = p.residence_site_id as number | null; if (r != null) res.set(r, (res.get(r) ?? 0) + 1);
  }
  return (rows ?? []).map((s) => ({ id: s.id as number, name: s.name as string, workCount: work.get(s.id as number) ?? 0, residenceCount: res.get(s.id as number) ?? 0 }));
});

/** Resolve a site by name, creating it if new. Returns its id (or null for blank). */
export async function resolveSiteId(name: string | null | undefined): Promise<number | null> {
  const clean = (name ?? "").trim();
  if (!clean) return null;
  const { data: existing } = await sb.from("sites").select("id").ilike("name", clean).maybeSingle();
  if (existing) return existing.id as number;
  const { data: created } = await sb.from("sites").insert({ name: clean }).select("id").single();
  return (created?.id as number | undefined) ?? null;
}
