// ─────────────────────────────────────────────────────────────────────────────
// PROJECT REQUISITIONS — request → approve → receive (Phase 3).
//
// ⚠️ SERVER-ONLY (imports `sb`). Client half: project-requisitions-shared.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { logProjectChange, logRowCreated, logRowUpdate, snapshotRow } from "@/lib/project-audit";
import { num } from "@/lib/projects-shared";
import {
  deriveStatus, type Requisition, type RequisitionStatus,
} from "@/lib/project-requisitions-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const COLS = "id,project_id,item_code,batch_no,requested_date,qty_requested,rate,amount_requested,route,supplier,reference_no,remarks,amount_approved,approved_at,approved_by,received_date,grn_no,qty_received,amount_received,received_by,status,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Requisition {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    itemCode: r.item_code as string,
    batchNo: (r.batch_no as string | null) ?? null,
    requestedDate: (r.requested_date as string | null) ?? null,
    qtyRequested: (r.qty_requested as string | null) ?? null,
    rate: (r.rate as string | null) ?? null,
    amountRequested: (r.amount_requested as string | null) ?? "0",
    route: (r.route as string | null) ?? null,
    supplier: (r.supplier as string | null) ?? null,
    referenceNo: (r.reference_no as string | null) ?? null,
    remarks: (r.remarks as string | null) ?? null,
    amountApproved: (r.amount_approved as string | null) ?? null,
    receivedDate: (r.received_date as string | null) ?? null,
    grnNo: (r.grn_no as string | null) ?? null,
    qtyReceived: (r.qty_received as string | null) ?? null,
    amountReceived: (r.amount_received as string | null) ?? null,
    status: ((r.status as string | null) ?? "Requested") as RequisitionStatus,
  };
}

export async function listRequisitions(projectId: number): Promise<Requisition[]> {
  const { data } = await sb
    .from("project_requisitions")
    .select(COLS)
    .eq("project_id", projectId)
    .order("requested_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/* ──────────────────────────────────────────────────────────────── writes ─── */

export type RequisitionFields = {
  projectId: number;
  itemCode: string;
  batchNo?: string | null;
  requestedDate?: string | null;
  qtyRequested?: string | number | null;
  rate?: string | number | null;
  amountRequested?: string | number | null;
  route?: string | null;
  supplier?: string | null;
  referenceNo?: string | null;
  remarks?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Tolerates "1,174,500" and "1 174 500.50". Null when the box was empty. */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * Raise a request.
 *
 * ⚠️ `amount_approved` is NOT set here, on purpose. The workbook defaults its
 * approval column to the requested figure (`Q = J`), which makes "approved" and
 * "nobody has looked at this yet" indistinguishable, and every downstream total
 * then counts unreviewed requests as authorised money. Approving is a separate,
 * deliberate act — see `approveRequisition`.
 */
export async function createRequisition(f: RequisitionFields, createdBy = "web-ui"): Promise<WriteResult> {
  const itemCode = f.itemCode?.trim().toUpperCase();
  if (!itemCode) return { ok: false, error: "Choose which budget item this is for." };

  const row = {
    project_id: f.projectId,
    item_code: itemCode,
    batch_no: text(f.batchNo),
    requested_date: text(f.requestedDate),
    qty_requested: amount(f.qtyRequested),
    rate: amount(f.rate),
    amount_requested: amount(f.amountRequested) ?? "0",
    route: text(f.route),
    supplier: text(f.supplier),
    reference_no: text(f.referenceNo),
    remarks: text(f.remarks),
    status: "Requested",
    created_by: createdBy,
  };

  const { data, error } = await sb.from("project_requisitions").insert(row).select("id").single();
  if (error) {
    console.error("[requisitions] create failed:", error.message, row);
    // 23503 = foreign key violation: the item code is not on this project's budget.
    if (error.code === "23503") {
      return {
        ok: false,
        error: `“${itemCode}” is not on this project's budget. Add the budget line first, or pick an existing item.`,
      };
    }
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  await logRowCreated({ projectId: f.projectId, entity: "requisition", entityId: id, label: itemCode, row, by: createdBy });
  return { ok: true, id };
}

/**
 * Head office decides. `approved` may legitimately be **0** — "you may spend
 * nothing" is a decision — and only `null` means undecided.
 */
export async function approveRequisition(
  id: number, approved: string | number, approvedBy = "web-ui",
): Promise<WriteResult> {
  const value = amount(approved);
  if (value === null) return { ok: false, error: "Enter the amount being approved." };
  const before = await snapshotRow("project_requisitions", id);
  const patch = {
      amount_approved: value,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
      status: deriveStatus({ amountApproved: value, amountReceived: null }),
      updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("project_requisitions").update(patch).eq("id", id);
  if (error) {
    console.error("[requisitions] approve failed:", error.message);
    return { ok: false, error: error.message };
  }
  if (before) {
    await logRowUpdate({
      projectId: before.project_id as number, entity: "requisition", entityId: id,
      label: (before.item_code as string) ?? null, before, patch,
      action: "approved", by: approvedBy,
    });
  }
  return { ok: true, id };
}

/**
 * Record what actually turned up.
 *
 * ⚠️ Nothing here is pre-filled from the request. The caller passes what was
 * counted on site; if 92 bags arrive against 100 ordered, 92 is what is stored.
 * That is the entire reason this step exists, and the reason the workbook's
 * version fails — there the receiving columns copy the request, so a row nobody
 * checked is indistinguishable from one that was.
 */
export async function receiveRequisition(
  id: number,
  f: { grnNo?: string | null; receivedDate?: string | null; qtyReceived?: string | number | null; amountReceived: string | number; receivedBy?: string | null },
): Promise<WriteResult> {
  const value = amount(f.amountReceived);
  if (value === null) return { ok: false, error: "Enter the value of what was received." };
  const before = await snapshotRow("project_requisitions", id);
  const patch = {
      grn_no: text(f.grnNo),
      received_date: text(f.receivedDate) ?? new Date().toISOString().slice(0, 10),
      qty_received: amount(f.qtyReceived),
      amount_received: value,
      received_by: text(f.receivedBy),
      status: "Received",
      updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("project_requisitions").update(patch).eq("id", id);
  if (error) {
    console.error("[requisitions] receive failed:", error.message);
    return { ok: false, error: error.message };
  }
  if (before) {
    await logRowUpdate({
      projectId: before.project_id as number, entity: "requisition", entityId: id,
      label: (before.item_code as string) ?? null, before, patch, action: "received",
    });
  }
  return { ok: true, id };
}

/** Reject or cancel — a decision, so it is stored rather than derived. */
export async function setRequisitionStatus(id: number, status: "Rejected" | "Cancelled" | "Requested"): Promise<WriteResult> {
  const before = await snapshotRow("project_requisitions", id);
  const { error } = await sb
    .from("project_requisitions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await logProjectChange({
      projectId: before.project_id as number, entity: "requisition", entityId: id,
      label: (before.item_code as string) ?? null, action: status.toLowerCase(),
      field: "status", oldValue: before.status, newValue: status,
    });
  }
  return { ok: true, id };
}

/** Money approved per item code — what the budget balance is measured against. */
export async function approvedByItem(projectId: number): Promise<Map<string, number>> {
  const { data } = await sb
    .from("project_requisitions")
    .select("item_code,amount_approved,status")
    .eq("project_id", projectId);
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    const status = r.status as string;
    if (status === "Rejected" || status === "Cancelled") continue;
    const a = num(r.amount_approved as string | null);
    if (a === null) continue;
    const code = r.item_code as string;
    out.set(code, (out.get(code) ?? 0) + a);
  }
  return out;
}
