import { sb } from "@/db/supabase";
import type { SiteToolRow, ToolCondition } from "@/lib/site-tools-shared";

/* ------------------------------------------------------------------ */
/* Site tools & equipment — quantity-tracked, site-owned durable kit.  */
/* No serial numbers and no single holder; each row is a tool kind at  */
/* one site with a count and a condition. Distinct from individually-  */
/* serialised assets and from office-only OECR consumables.            */
/* ------------------------------------------------------------------ */

type Embed = { name: string } | { name: string }[] | null;
type Row = {
  id: number;
  company_id: number | null;
  name: string;
  quantity: number;
  specification: string | null;
  location: string | null;
  condition: string;
  purchased_date: string | null;
  remark: string | null;
  company?: Embed;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

const SELECT =
  "id,company_id,name,quantity,specification,location,condition,purchased_date,remark," +
  " company:companies!site_tools_company_id_companies_id_fk(name)";

function map(r: Row): SiteToolRow {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: one(r.company)?.name ?? null,
    name: r.name,
    quantity: r.quantity,
    specification: r.specification,
    location: r.location,
    condition: (r.condition as ToolCondition) ?? "good",
    purchasedDate: r.purchased_date,
    remark: r.remark,
  };
}

export async function listSiteTools(): Promise<SiteToolRow[]> {
  const { data, error } = await sb
    .from("site_tools")
    .select(SELECT)
    .eq("archived", false)
    .order("location", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
}

export type SiteToolMetrics = {
  lines: number;
  units: number;
  needsAttention: number; // not "good"
};

export function siteToolMetrics(rows: SiteToolRow[]): SiteToolMetrics {
  return {
    lines: rows.length,
    units: rows.reduce((sum, t) => sum + (t.quantity ?? 0), 0),
    needsAttention: rows.filter((t) => t.condition !== "good").length,
  };
}

export type SiteToolInput = {
  companyId: number | null;
  name: string;
  quantity: number;
  specification: string | null;
  location: string | null;
  condition: ToolCondition;
  purchasedDate: string | null; // ISO or null
  remark: string | null;
};

export async function createSiteTool(input: SiteToolInput): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("site_tools")
    .insert({
      company_id: input.companyId,
      name: input.name,
      quantity: input.quantity,
      specification: input.specification,
      location: input.location,
      condition: input.condition,
      purchased_date: input.purchasedDate,
      remark: input.remark,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function createSiteToolsBulk(inputs: SiteToolInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = inputs.map((input) => ({
    company_id: input.companyId,
    name: input.name,
    quantity: input.quantity,
    specification: input.specification,
    location: input.location,
    condition: input.condition,
    purchased_date: input.purchasedDate,
    remark: input.remark,
    created_at: now,
    updated_at: now,
  }));
  const { data, error } = await sb.from("site_tools").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function updateSiteTool(id: number, input: SiteToolInput): Promise<void> {
  const { error } = await sb
    .from("site_tools")
    .update({
      company_id: input.companyId,
      name: input.name,
      quantity: input.quantity,
      specification: input.specification,
      location: input.location,
      condition: input.condition,
      purchased_date: input.purchasedDate,
      remark: input.remark,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setSiteToolQuantity(id: number, quantity: number): Promise<void> {
  const { error } = await sb
    .from("site_tools")
    .update({ quantity: Math.max(0, quantity), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveSiteTool(id: number, archived: boolean): Promise<void> {
  const { error } = await sb
    .from("site_tools")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
