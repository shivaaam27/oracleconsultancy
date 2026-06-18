import { and, eq, isNull, sql } from "drizzle-orm";
import { sb } from "@/db/supabase";
import { siteTools, siteToolMovements } from "@/db/schema";
import { withTx, type Tx } from "@/lib/tx";
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

/**
 * Insert a movement ledger row using the Drizzle `tx` handle, so it commits in
 * the SAME transaction as the quantity change it records (ACTHRMS-01).
 */
async function logMovementTx(tx: Tx, m: MovementInsert, now: Date): Promise<void> {
  await tx.insert(siteToolMovements).values({
    toolId: m.toolId ?? null,
    toolName: m.toolName,
    type: m.type,
    quantity: m.quantity ?? null,
    fromLocation: m.fromLocation ?? null,
    toLocation: m.toLocation ?? null,
    fromCondition: m.fromCondition ?? null,
    toCondition: m.toCondition ?? null,
    reason: m.reason ?? null,
    createdAt: now,
  });
}

/** Change a whole row's condition and log it. */
export async function setSiteToolCondition(id: number, condition: ToolCondition): Promise<void> {
  const now = new Date();
  await withTx(async (tx) => {
    const [cur] = await tx
      .select({ name: siteTools.name, condition: siteTools.condition })
      .from(siteTools)
      .where(eq(siteTools.id, id));
    if (!cur) throw new Error("Tool not found.");
    if (cur.condition === condition) return;
    await tx
      .update(siteTools)
      .set({ condition, updatedAt: now })
      .where(eq(siteTools.id, id));
    await logMovementTx(tx, {
      toolId: id, toolName: cur.name, type: "condition",
      fromCondition: cur.condition, toCondition: condition,
    }, now);
  });
}

/**
 * Move `qty` units of a tool to another site. Decrements the source row and
 * merges into a matching row at the destination (same name/spec/condition/
 * company), creating it if needed. Logged as one transfer movement.
 *
 * Atomic (ACTHRMS-01): the whole movement runs inside one transaction with a
 * RELATIVE, guarded decrement (`quantity = quantity - move WHERE quantity >= move`)
 * so concurrent movements compose and a partial failure rolls back — units can
 * never be duplicated at both sites or driven negative.
 */
export async function transferSiteTool(id: number, qty: number, toLocation: string): Promise<void> {
  const want = Math.max(1, Math.floor(qty));
  if (want <= 0) return;
  const now = new Date();
  await withTx(async (tx) => {
    const [src] = await tx
      .select({
        name: siteTools.name,
        quantity: siteTools.quantity,
        specification: siteTools.specification,
        condition: siteTools.condition,
        companyId: siteTools.companyId,
        location: siteTools.location,
      })
      .from(siteTools)
      .where(eq(siteTools.id, id));
    if (!src) throw new Error("Tool not found.");
    const move = Math.min(want, src.quantity);
    if (move <= 0) return;

    // Guarded relative decrement of the source. The WHERE re-checks the balance
    // inside the transaction, so a concurrent movement cannot take it negative.
    const decremented = await tx
      .update(siteTools)
      .set({ quantity: sql`${siteTools.quantity} - ${move}`, updatedAt: now })
      .where(and(eq(siteTools.id, id), sql`${siteTools.quantity} >= ${move}`))
      .returning({ id: siteTools.id });
    if (decremented.length === 0) throw new Error("Not enough units in stock to transfer.");

    // Find an existing destination row to merge into.
    const dest = await tx
      .select({ id: siteTools.id })
      .from(siteTools)
      .where(
        and(
          eq(siteTools.name, src.name),
          eq(siteTools.condition, src.condition),
          eq(siteTools.location, toLocation),
          eq(siteTools.archived, false),
          src.companyId == null ? isNull(siteTools.companyId) : eq(siteTools.companyId, src.companyId),
          src.specification == null ? isNull(siteTools.specification) : eq(siteTools.specification, src.specification),
        ),
      )
      .limit(1);

    if (dest[0]) {
      await tx
        .update(siteTools)
        .set({ quantity: sql`${siteTools.quantity} + ${move}`, updatedAt: now })
        .where(eq(siteTools.id, dest[0].id));
    } else {
      await tx.insert(siteTools).values({
        companyId: src.companyId,
        name: src.name,
        quantity: move,
        specification: src.specification,
        location: toLocation,
        condition: src.condition,
        createdAt: now,
        updatedAt: now,
      });
    }
    await logMovementTx(tx, {
      toolId: id, toolName: src.name, type: "transfer", quantity: move,
      fromLocation: src.location, toLocation,
    }, now);
  });
}

/** Write off `qty` units (lost/disposed) with a reason. Decrements the row. */
export async function writeOffSiteTool(id: number, qty: number, reason: string | null): Promise<void> {
  const want = Math.max(1, Math.floor(qty));
  if (want <= 0) return;
  const now = new Date();
  await withTx(async (tx) => {
    const [src] = await tx
      .select({
        name: siteTools.name,
        quantity: siteTools.quantity,
        location: siteTools.location,
        condition: siteTools.condition,
      })
      .from(siteTools)
      .where(eq(siteTools.id, id));
    if (!src) throw new Error("Tool not found.");
    const off = Math.min(want, src.quantity);
    if (off <= 0) return;

    // Guarded relative decrement — atomic with the ledger row below.
    const written = await tx
      .update(siteTools)
      .set({ quantity: sql`${siteTools.quantity} - ${off}`, updatedAt: now })
      .where(and(eq(siteTools.id, id), sql`${siteTools.quantity} >= ${off}`))
      .returning({ id: siteTools.id });
    if (written.length === 0) throw new Error("Not enough units in stock to write off.");

    await logMovementTx(tx, {
      toolId: id, toolName: src.name, type: "write_off", quantity: off,
      fromLocation: src.location, fromCondition: src.condition, reason,
    }, now);
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
