// ─────────────────────────────────────────────────────────────────────────────
// OPS ORDER LINES — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// One row is one PO line. The client half is `ops-orders-shared.ts`, and every
// total, margin and overdue count lives there — nothing derived is stored.
//
// ⚠️ NOTHING IS FILLED IN FOR THE OWNER. No status is assumed, no quantity is
// copied from the sale to the purchase, no currency is guessed, no total is
// written. A field he did not type stays null. The one exception is the
// exchange rate, which he asked to be OFFERED on a new line (his decision,
// Aug 2026) — and it is offered by the FORM, not applied here.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import type { OrderLine } from "@/lib/ops-orders-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type (learned in lib/projects.ts).
const COLS = "id,company_id,po_no,client,cost_centre,received_date,due_date,description,qty,uom,sale_currency,sale_unit_price,ex_rate,kind,quotation_no,quoted_unit_bp,lc_factor,source,supplier,origin,prof_no,purchase_date,purchase_currency,purchase_qty,purchase_unit_price,supplier_payment_date,shipment_id,invoice_id,delivered_qty,status,pending_with,remarks,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): OrderLine {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    poNo: r.po_no as string,
    client: s("client"),
    costCentre: s("cost_centre"),
    receivedDate: s("received_date"),
    dueDate: s("due_date"),
    description: r.description as string,
    qty: s("qty"),
    uom: s("uom"),
    saleCurrency: s("sale_currency"),
    saleUnitPrice: s("sale_unit_price"),
    exRate: s("ex_rate"),
    kind: s("kind"),
    quotationNo: s("quotation_no"),
    quotedUnitBp: s("quoted_unit_bp"),
    lcFactor: s("lc_factor"),
    source: s("source"),
    supplier: s("supplier"),
    origin: s("origin"),
    profNo: s("prof_no"),
    purchaseDate: s("purchase_date"),
    purchaseCurrency: s("purchase_currency"),
    purchaseQty: s("purchase_qty"),
    purchaseUnitPrice: s("purchase_unit_price"),
    supplierPaymentDate: s("supplier_payment_date"),
    status: s("status"),
    pendingWith: s("pending_with"),
    remarks: s("remarks"),
    shipmentId: (r.shipment_id as number | null) ?? null,
    invoiceId: (r.invoice_id as number | null) ?? null,
    deliveredQty: s("delivered_qty"),
    archived: Boolean(r.archived),
  };
}

export async function listOrderLines(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<OrderLine[]> {
  let q = sb.from("ops_order_lines").select(COLS).eq("company_id", companyId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q
    .order("received_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getOrderLine(id: number): Promise<OrderLine | null> {
  const { data } = await sb.from("ops_order_lines").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** The values already used in a field, so the box can suggest them.
 *
 *  ⚠️ This is the "middle path" the owner chose for items: keep typing free
 *  text, but offer what has been typed before, so one valve does not become six
 *  valves. It SUGGESTS. It never fills anything in. */
export async function usedValues(companyId: number, column: string, limit = 400): Promise<string[]> {
  const { data } = await sb
    .from("ops_order_lines").select(column).eq("company_id", companyId).limit(2000);
  const seen = new Map<string, number>();
  // ⚠️ `as unknown as` first: a dynamic column name defeats supabase-js's
  // type-level parser, so the row type comes back as GenericStringError.
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const v = row[column];
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  // Most-used first: the thing typed forty times should be the first offer.
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

/* ─────────────────────────────────────────────────────────────── writing ─── */

export type OrderLineFields = {
  companyId: number;
  poNo: string;
  description: string;
  client?: string | null;
  costCentre?: string | null;
  receivedDate?: string | null;
  dueDate?: string | null;
  qty?: string | number | null;
  uom?: string | null;
  saleCurrency?: string | null;
  saleUnitPrice?: string | number | null;
  exRate?: string | number | null;
  kind?: string | null;
  quotationNo?: string | null;
  quotedUnitBp?: string | number | null;
  lcFactor?: string | number | null;
  source?: string | null;
  supplier?: string | null;
  origin?: string | null;
  profNo?: string | null;
  purchaseDate?: string | null;
  purchaseCurrency?: string | null;
  purchaseQty?: string | number | null;
  purchaseUnitPrice?: string | number | null;
  supplierPaymentDate?: string | null;
  status?: string | null;
  pendingWith?: string | null;
  remarks?: string | null;
  /** How many of `qty` went out. ⚠️ The delivery note and the invoice itself
   *  live on `ops_invoices`; the line only points at one. */
  deliveredQty?: string | number | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * A number, or null.
 *
 * ⚠️ Blank stays BLANK — never 0. "No quantity recorded" and "a quantity of
 * none" are different facts, and it is the second one that makes a spreadsheet
 * total lie.
 */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

/** The database shape of whatever was actually filled in. */
function toRow(f: Partial<OrderLineFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => { if (value !== undefined) row[key] = value; };

  if (f.poNo !== undefined) put("po_no", (f.poNo ?? "").trim());
  if (f.description !== undefined) put("description", (f.description ?? "").trim());
  if (f.client !== undefined) put("client", text(f.client));
  if (f.costCentre !== undefined) put("cost_centre", text(f.costCentre));
  if (f.receivedDate !== undefined) put("received_date", text(f.receivedDate));
  if (f.dueDate !== undefined) put("due_date", text(f.dueDate));
  if (f.qty !== undefined) put("qty", amount(f.qty));
  if (f.uom !== undefined) put("uom", text(f.uom));
  if (f.saleCurrency !== undefined) put("sale_currency", text(f.saleCurrency));
  if (f.saleUnitPrice !== undefined) put("sale_unit_price", amount(f.saleUnitPrice));
  if (f.exRate !== undefined) put("ex_rate", amount(f.exRate));
  if (f.kind !== undefined) put("kind", text(f.kind));
  if (f.quotationNo !== undefined) put("quotation_no", text(f.quotationNo));
  if (f.quotedUnitBp !== undefined) put("quoted_unit_bp", amount(f.quotedUnitBp));
  if (f.lcFactor !== undefined) put("lc_factor", amount(f.lcFactor));
  if (f.source !== undefined) put("source", text(f.source));
  if (f.supplier !== undefined) put("supplier", text(f.supplier));
  if (f.origin !== undefined) put("origin", text(f.origin));
  if (f.profNo !== undefined) put("prof_no", text(f.profNo));
  if (f.purchaseDate !== undefined) put("purchase_date", text(f.purchaseDate));
  if (f.purchaseCurrency !== undefined) put("purchase_currency", text(f.purchaseCurrency));
  if (f.purchaseQty !== undefined) put("purchase_qty", amount(f.purchaseQty));
  if (f.purchaseUnitPrice !== undefined) put("purchase_unit_price", amount(f.purchaseUnitPrice));
  if (f.supplierPaymentDate !== undefined) put("supplier_payment_date", text(f.supplierPaymentDate));
  if (f.status !== undefined) put("status", text(f.status));
  if (f.pendingWith !== undefined) put("pending_with", text(f.pendingWith));
  if (f.remarks !== undefined) put("remarks", text(f.remarks));
  if (f.deliveredQty !== undefined) put("delivered_qty", amount(f.deliveredQty));
  return row;
}

/* ───────────────────────────────────────────────────────────── the trail ─── */

const NOISE = new Set(["updated_at", "created_at", "created_by", "company_id", "id"]);

async function log(entries: Array<Record<string, unknown>>): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await sb.from("ops_audit").insert(entries);
    if (error) console.error("[ops audit] write failed:", error.message);
  } catch (err) {
    // ⚠️ Swallowed on purpose. A missing audit line is a gap; a refused order
    // entry is a lie about the day's work.
    console.error("[ops audit] write threw:", err);
  }
}

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** A calendar date, when the string is one — including one Postgres has read
 *  back as a timestamp at midnight UTC. */
const ISO_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.0+)?(?:Z|\+00:?00))?$/;

/**
 * Are these two the SAME VALUE, as far as the trail is concerned?
 *
 * ⚠️ Plain string comparison cries wolf, and a trail that reports changes
 * nobody made is worth no more than no trail at all. Two cases arise on every
 * re-save, because the form sends what a person typed and the database returns
 * what it stored:
 *
 *   · a date        `2026-06-04` came back as `2026-06-04T00:00:00+00:00`
 *   · a number      `2500` came back from `numeric(14,4)` as `2500.0000`
 *
 * ⚠️ The numeric rule needs ONE SIDE TO CARRY A DECIMAL POINT, so it can only
 * ever collapse trailing zeros. Without that guard it would also call PO
 * `024235` the same as PO `24235`, and quietly hide a real correction — most
 * of the reference numbers in this module look like integers.
 *
 * Shared by all three ops writers (order lines, shipments, enquiries).
 */
export function sameAuditValue(a: unknown, b: unknown): boolean {
  const x = asText(a), y = asText(b);
  if (x === y) return true;
  if (x === null || y === null) return false;

  const dx = ISO_MIDNIGHT.exec(x), dy = ISO_MIDNIGHT.exec(y);
  if (dx && dy) return dx[1] === dy[1];

  if (x.includes(".") || y.includes(".")) {
    const nx = Number(x), ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny;
  }
  return false;
}

/* ──────────────────────────────────────────────────────────────── writes ─── */

export async function createOrderLine(f: OrderLineFields, createdBy = "web-ui"): Promise<WriteResult> {
  const poNo = (f.poNo ?? "").trim();
  if (!poNo) return { ok: false, error: "Give the line a PO number." };
  const description = (f.description ?? "").trim();
  if (!description) return { ok: false, error: "Say what the line is for." };

  const row = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  const { data, error } = await sb.from("ops_order_lines").insert(row).select("id").single();
  if (error) {
    // Logged in full: a silent failure with a friendly line on screen is what
    // cost the owner a typed-in project once already.
    console.error("[ops orders] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "order_line", entity_id: id,
    label: poNo, action: "created", new_value: filled.join(", ") || null, created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updateOrderLine(
  id: number, patch: Partial<OrderLineFields>, by = "web-ui",
): Promise<WriteResult> {
  const row = { ...toRow(patch), updated_at: new Date().toISOString() };

  // Read first — after the update the old figure is gone, and "what was it
  // before?" is the whole question the trail exists to answer.
  const { data: before } = await sb.from("ops_order_lines").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_order_lines").update(row).eq("id", id);
  if (error) {
    console.error("[ops orders] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  if (before) {
    const b = before as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "order_line", entity_id: id,
        label: (b.po_no as string) ?? null, action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      }));
    await log(entries);
  }
  return { ok: true, id };
}

/**
 * Archive, never delete — the line is a real order somebody placed.
 *
 * This is the same line the rest of COS holds ("Delete it" → archive it).
 */
export async function archiveOrderLine(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_order_lines").select("company_id,po_no").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_order_lines")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "order_line", entity_id: id,
      label: (before.po_no as string) ?? null,
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}

/** The trail for one company, newest first. */
export async function listOpsAudit(
  companyId: number, opts: { entityId?: number; limit?: number } = {},
): Promise<Array<{
  id: number; entity: string; entityId: number | null; label: string | null;
  action: string; field: string | null; oldValue: string | null; newValue: string | null;
  createdBy: string; createdAt: string;
}>> {
  let q = sb
    .from("ops_audit")
    .select("id,entity,entity_id,label,action,field,old_value,new_value,created_by,created_at")
    .eq("company_id", companyId);
  if (opts.entityId !== undefined) q = q.eq("entity_id", opts.entityId);
  const { data } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit ?? 500);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    entity: r.entity as string,
    entityId: (r.entity_id as number | null) ?? null,
    label: (r.label as string | null) ?? null,
    action: r.action as string,
    field: (r.field as string | null) ?? null,
    oldValue: (r.old_value as string | null) ?? null,
    newValue: (r.new_value as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? "web-ui",
    createdAt: String(r.created_at),
  }));
}
