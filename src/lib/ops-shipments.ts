// ─────────────────────────────────────────────────────────────────────────────
// SHIPMENTS — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// One bill of lading, typed once, with the order lines pointing at it. The
// client half is `ops-shipments-shared.ts` and holds every derived figure.
//
// ⚠️ Nothing is filled in. No status, no agent, no rate, no date is assumed,
// and a blank cost stays blank — an unassessed shipment costs an UNKNOWN
// amount, not nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
// ⚠️ Shared with the order lines and the enquiries: a re-save must not report
// a change nobody made. See its comment in `ops-orders.ts`.
import { sameAuditValue } from "@/lib/ops-orders";
import type { Shipment } from "@/lib/ops-shipments-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const COLS = "id,company_id,bl_no,bl_date,supplier,origin,mode,clearing_agent,dox_lodged,eta,berth_date,cleared_date,assessment_date,duty_amount,vat_amount,wharfage,agency_fees,other_costs,freight_amount,cost_currency,ex_rate,ref_no,freight_supplier,freight_invoice_no,amount_paid,paid_date,status,pending_with,notes,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Shipment {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    blNo: r.bl_no as string,
    blDate: s("bl_date"),
    supplier: s("supplier"),
    origin: s("origin"),
    mode: s("mode"),
    clearingAgent: s("clearing_agent"),
    doxLodged: s("dox_lodged"),
    eta: s("eta"),
    berthDate: s("berth_date"),
    clearedDate: s("cleared_date"),
    assessmentDate: s("assessment_date"),
    dutyAmount: s("duty_amount"),
    vatAmount: s("vat_amount"),
    wharfage: s("wharfage"),
    agencyFees: s("agency_fees"),
    otherCosts: s("other_costs"),
    freightAmount: s("freight_amount"),
    costCurrency: s("cost_currency"),
    exRate: s("ex_rate"),
    refNo: s("ref_no"),
    freightSupplier: s("freight_supplier"),
    freightInvoiceNo: s("freight_invoice_no"),
    amountPaid: s("amount_paid"),
    paidDate: s("paid_date"),
    status: s("status"),
    pendingWith: s("pending_with"),
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

export async function listShipments(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<Shipment[]> {
  let q = sb.from("ops_shipments").select(COLS).eq("company_id", companyId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q
    .order("eta", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** How many order lines travel on each shipment — shown on the row. */
export async function linesPerShipment(companyId: number): Promise<Map<number, number>> {
  const { data } = await sb
    .from("ops_order_lines").select("shipment_id").eq("company_id", companyId).eq("archived", false);
  const out = new Map<number, number>();
  for (const r of data ?? []) {
    const id = (r as Record<string, unknown>).shipment_id as number | null;
    if (id === null || id === undefined) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────── writing ─── */

export type ShipmentFields = {
  companyId: number;
  blNo: string;
  blDate?: string | null;
  supplier?: string | null;
  origin?: string | null;
  mode?: string | null;
  clearingAgent?: string | null;
  doxLodged?: string | null;
  eta?: string | null;
  berthDate?: string | null;
  clearedDate?: string | null;
  assessmentDate?: string | null;
  dutyAmount?: string | number | null;
  vatAmount?: string | number | null;
  wharfage?: string | number | null;
  agencyFees?: string | number | null;
  otherCosts?: string | number | null;
  freightAmount?: string | number | null;
  costCurrency?: string | null;
  exRate?: string | number | null;
  refNo?: string | null;
  freightSupplier?: string | null;
  freightInvoiceNo?: string | null;
  amountPaid?: string | number | null;
  paidDate?: string | null;
  status?: string | null;
  pendingWith?: string | null;
  notes?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** ⚠️ Blank stays blank, never 0 — an unassessed charge is unknown, not free. */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function toRow(f: Partial<ShipmentFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const T = (k: string, v: string | null | undefined) => { if (v !== undefined) row[k] = text(v); };
  const N = (k: string, v: string | number | null | undefined) => { if (v !== undefined) row[k] = amount(v); };

  if (f.blNo !== undefined) row.bl_no = (f.blNo ?? "").trim();
  T("bl_date", f.blDate); T("supplier", f.supplier); T("origin", f.origin); T("mode", f.mode);
  T("clearing_agent", f.clearingAgent); T("dox_lodged", f.doxLodged); T("eta", f.eta);
  T("berth_date", f.berthDate); T("cleared_date", f.clearedDate);
  T("assessment_date", f.assessmentDate);
  N("duty_amount", f.dutyAmount); N("vat_amount", f.vatAmount); N("wharfage", f.wharfage);
  N("agency_fees", f.agencyFees); N("other_costs", f.otherCosts); N("freight_amount", f.freightAmount);
  T("cost_currency", f.costCurrency); N("ex_rate", f.exRate);
  N("amount_paid", f.amountPaid); T("paid_date", f.paidDate);
  T("status", f.status); T("pending_with", f.pendingWith); T("notes", f.notes);
  return row;
}

const NOISE = new Set(["updated_at", "created_at", "created_by", "company_id", "id"]);
const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** ⚠️ Never breaks the write — a gap in the trail beats a refused entry. */
async function log(entries: Array<Record<string, unknown>>): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await sb.from("ops_audit").insert(entries);
    if (error) console.error("[ops audit] write failed:", error.message);
  } catch (err) {
    console.error("[ops audit] write threw:", err);
  }
}

export async function createShipment(f: ShipmentFields, createdBy = "web-ui"): Promise<WriteResult> {
  const blNo = (f.blNo ?? "").trim();
  if (!blNo) return { ok: false, error: "Give the shipment its BL or airway bill number." };

  const row = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  const { data, error } = await sb.from("ops_shipments").insert(row).select("id").single();
  if (error) {
    console.error("[ops shipments] create failed:", error.message, row);
    // 23505 = that BL is already on this company. Say which, or somebody hunts.
    if (error.code === "23505") return { ok: false, error: `“${blNo}” is already recorded.` };
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "shipment", entity_id: id, label: blNo,
    action: "created", new_value: filled.join(", ") || null, created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updateShipment(
  id: number, patch: Partial<ShipmentFields>, by = "web-ui",
): Promise<WriteResult> {
  const row = { ...toRow(patch), updated_at: new Date().toISOString() };
  // Read first: after the update the old figure is gone.
  const { data: before } = await sb.from("ops_shipments").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_shipments").update(row).eq("id", id);
  if (error) {
    console.error("[ops shipments] update failed:", error.message, row);
    if (error.code === "23505") return { ok: false, error: "Another shipment already has that BL number." };
    return { ok: false, error: error.message };
  }
  if (before) {
    const b = before as Record<string, unknown>;
    await log(Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "shipment", entity_id: id,
        label: (b.bl_no as string) ?? null, action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      })));
  }
  return { ok: true, id };
}

/** Archive, never delete — a shipment is a real consignment that really moved. */
export async function archiveShipment(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_shipments").select("company_id,bl_no").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_shipments").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "shipment", entity_id: id,
      label: (before.bl_no as string) ?? null,
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}

/**
 * Put an order line on a shipment, or take it off.
 *
 * ⚠️ Nothing is copied onto the line. It points at the shipment and reads the
 * ETA, the agent and its share of the duty from there — which is the whole
 * reason the shipment is its own record.
 */
export async function setLineShipment(
  lineId: number, shipmentId: number | null, by = "web-ui",
): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_order_lines").select("company_id,po_no,shipment_id").eq("id", lineId).maybeSingle();
  const { error } = await sb
    .from("ops_order_lines")
    .update({ shipment_id: shipmentId, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "order_line", entity_id: lineId,
      label: (before.po_no as string) ?? null, action: "updated", field: "shipment_id",
      old_value: asText(before.shipment_id), new_value: asText(shipmentId), created_by: by,
    }]);
  }
  return { ok: true, id: lineId };
}
