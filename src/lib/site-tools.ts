import { sb } from "@/db/supabase";
import { isLowStock, type SiteToolRow, type SiteToolMovementRow, type ToolCondition } from "@/lib/site-tools-shared";

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
  min_qty: number;
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
  "id,company_id,name,quantity,min_qty,specification,location,condition,purchased_date,remark," +
  " company:companies!site_tools_company_id_companies_id_fk(name)";

function map(r: Row): SiteToolRow {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: one(r.company)?.name ?? null,
    name: r.name,
    quantity: r.quantity,
    minQty: r.min_qty ?? 0,
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
  lowStock: number; // at or below their min level
};

export function siteToolMetrics(rows: SiteToolRow[]): SiteToolMetrics {
  return {
    lines: rows.length,
    units: rows.reduce((sum, t) => sum + (t.quantity ?? 0), 0),
    needsAttention: rows.filter((t) => t.condition !== "good").length,
    lowStock: rows.filter(isLowStock).length,
  };
}

export type SiteToolInput = {
  companyId: number | null;
  name: string;
  quantity: number;
  minQty: number;
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
      min_qty: input.minQty,
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
      min_qty: input.minQty,
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

/* ----------------------------- movements ------------------------------ */

type MovementInsert = {
  toolId: number | null;
  toolName: string;
  type: SiteToolMovementRow["type"];
  quantity?: number | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  fromCondition?: string | null;
  toCondition?: string | null;
  reason?: string | null;
};

async function logMovement(m: MovementInsert): Promise<void> {
  const { error } = await sb.from("site_tool_movements").insert({
    tool_id: m.toolId,
    tool_name: m.toolName,
    type: m.type,
    quantity: m.quantity ?? null,
    from_location: m.fromLocation ?? null,
    to_location: m.toLocation ?? null,
    from_condition: m.fromCondition ?? null,
    to_condition: m.toCondition ?? null,
    reason: m.reason ?? null,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Change a whole row's condition and log it. */
export async function setSiteToolCondition(id: number, condition: ToolCondition): Promise<void> {
  const { data: cur, error: cErr } = await sb
    .from("site_tools").select("name,condition").eq("id", id).single();
  if (cErr) throw new Error(cErr.message);
  if (cur.condition === condition) return;
  const { error } = await sb
    .from("site_tools").update({ condition, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await logMovement({
    toolId: id, toolName: cur.name as string, type: "condition",
    fromCondition: cur.condition as string, toCondition: condition,
  });
}

/**
 * Move `qty` units of a tool to another site. Decrements the source row and
 * merges into a matching row at the destination (same name/spec/condition/
 * company), creating it if needed. Logged as one transfer movement.
 */
export async function transferSiteTool(id: number, qty: number, toLocation: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: src, error: sErr } = await sb
    .from("site_tools")
    .select("name,quantity,specification,condition,company_id,location")
    .eq("id", id).single();
  if (sErr) throw new Error(sErr.message);
  const move = Math.min(Math.max(1, Math.floor(qty)), src.quantity as number);
  if (move <= 0) return;

  // Find an existing destination row to merge into.
  let q = sb.from("site_tools").select("id,quantity")
    .eq("name", src.name).eq("condition", src.condition).eq("location", toLocation).eq("archived", false);
  q = src.company_id == null ? q.is("company_id", null) : q.eq("company_id", src.company_id);
  q = src.specification == null ? q.is("specification", null) : q.eq("specification", src.specification);
  const { data: dest } = await q.limit(1).maybeSingle();

  if (dest) {
    await sb.from("site_tools").update({ quantity: (dest.quantity as number) + move, updated_at: now }).eq("id", dest.id);
  } else {
    await sb.from("site_tools").insert({
      company_id: src.company_id, name: src.name, quantity: move, specification: src.specification,
      location: toLocation, condition: src.condition, created_at: now, updated_at: now,
    });
  }
  const remaining = (src.quantity as number) - move;
  await sb.from("site_tools").update({ quantity: remaining, updated_at: now }).eq("id", id);
  await logMovement({
    toolId: id, toolName: src.name as string, type: "transfer", quantity: move,
    fromLocation: src.location as string | null, toLocation,
  });
}

/** Write off `qty` units (lost/disposed) with a reason. Decrements the row. */
export async function writeOffSiteTool(id: number, qty: number, reason: string | null): Promise<void> {
  const { data: src, error } = await sb
    .from("site_tools").select("name,quantity,location,condition").eq("id", id).single();
  if (error) throw new Error(error.message);
  const off = Math.min(Math.max(1, Math.floor(qty)), src.quantity as number);
  if (off <= 0) return;
  await sb.from("site_tools")
    .update({ quantity: (src.quantity as number) - off, updated_at: new Date().toISOString() }).eq("id", id);
  await logMovement({
    toolId: id, toolName: src.name as string, type: "write_off", quantity: off,
    fromLocation: src.location as string | null, fromCondition: src.condition as string | null, reason,
  });
}

const MOVE_SELECT =
  "id,tool_id,tool_name,type,quantity,from_location,to_location,from_condition,to_condition,reason,created_at";

export async function listSiteToolMovements(toolId?: number, limit = 100): Promise<SiteToolMovementRow[]> {
  let q = sb.from("site_tool_movements").select(MOVE_SELECT).order("created_at", { ascending: false }).limit(limit);
  if (toolId != null) q = q.eq("tool_id", toolId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    toolId: r.tool_id as number | null,
    toolName: r.tool_name as string,
    type: r.type as SiteToolMovementRow["type"],
    quantity: r.quantity as number | null,
    fromLocation: r.from_location as string | null,
    toLocation: r.to_location as string | null,
    fromCondition: r.from_condition as string | null,
    toCondition: r.to_condition as string | null,
    reason: r.reason as string | null,
    createdAt: r.created_at as string,
  }));
}
