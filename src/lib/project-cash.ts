// Payments and expenditures — server half (Phase 4).
// ⚠️ SERVER-ONLY (imports `sb`). Client half: project-cash-shared.ts.

import { sb } from "@/db/supabase";
import { logProjectChange, logRowCreated, snapshotRow } from "@/lib/project-audit";
import type { Payment, Expenditure } from "@/lib/project-cash-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const PAY_COLS = "id,project_id,route,reference_no,batch_no,supplier,paid_date,amount_paid,total_payable,notes";
const EXP_COLS = "id,project_id,spent_date,item_code,description,payer,amount,source,mobile_no,batch_no,notes";

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
function amount(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "0";
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "0";
}

/* ─────────────────────────────────────────────────────────────── payments ── */

export async function listPayments(projectId: number): Promise<Payment[]> {
  const { data } = await sb
    .from("project_payments").select(PAY_COLS).eq("project_id", projectId)
    .order("paid_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    projectId: r.project_id as number,
    route: (r.route as string) ?? "DIRECT",
    referenceNo: (r.reference_no as string | null) ?? null,
    batchNo: (r.batch_no as string | null) ?? null,
    supplier: (r.supplier as string | null) ?? null,
    paidDate: (r.paid_date as string | null) ?? null,
    amountPaid: (r.amount_paid as string | null) ?? "0",
    totalPayable: (r.total_payable as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
}

export type PaymentFields = {
  projectId: number;
  route: string;
  referenceNo?: string | null;
  batchNo?: string | null;
  supplier?: string | null;
  paidDate?: string | null;
  amountPaid: string | number;
  /** The invoice in full. Blank = work it out from what was approved. */
  totalPayable?: string | number | null;
  notes?: string | null;
};

/** Blank stays blank — an untyped invoice total is unknown, not zero. */
function optionalAmount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

export async function createPayment(f: PaymentFields, createdBy = "web-ui"): Promise<WriteResult> {
  const row = {
    project_id: f.projectId,
    route: (f.route || "DIRECT").toUpperCase(),
    reference_no: text(f.referenceNo),
    batch_no: text(f.batchNo),
    supplier: text(f.supplier),
    paid_date: text(f.paidDate),
    amount_paid: amount(f.amountPaid),
    total_payable: optionalAmount(f.totalPayable),
    notes: text(f.notes),
    created_by: createdBy,
  };
  const { data, error } = await sb.from("project_payments").insert(row).select("id").single();
  if (error) {
    console.error("[payments] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  await logRowCreated({
    projectId: f.projectId, entity: "payment", entityId: id,
    label: row.reference_no ?? row.batch_no ?? row.route, row, by: createdBy,
  });
  return { ok: true, id };
}

export async function deletePayment(id: number): Promise<WriteResult> {
  const before = await snapshotRow("project_payments", id);
  const { error } = await sb.from("project_payments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await logProjectChange({
      projectId: before.project_id as number, entity: "payment", entityId: id,
      label: (before.reference_no as string | null) ?? (before.batch_no as string | null) ?? (before.route as string),
      action: "deleted", field: "amount_paid", oldValue: before.amount_paid,
    });
  }
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── expenditures ── */

export async function listExpenditures(projectId: number): Promise<Expenditure[]> {
  const { data } = await sb
    .from("project_expenditures").select(EXP_COLS).eq("project_id", projectId)
    .order("spent_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    projectId: r.project_id as number,
    spentDate: (r.spent_date as string | null) ?? null,
    itemCode: (r.item_code as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    payer: (r.payer as string) ?? "SHAO",
    amount: (r.amount as string | null) ?? "0",
    source: (r.source as string | null) ?? null,
    mobileNo: (r.mobile_no as string | null) ?? null,
    batchNo: (r.batch_no as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
}

export type ExpenditureFields = {
  projectId: number;
  spentDate?: string | null;
  itemCode?: string | null;
  description?: string | null;
  payer: string;
  amount: string | number;
  source?: string | null;
  mobileNo?: string | null;
  batchNo?: string | null;
  /** EXPENDITURES column H — the remarks box. */
  notes?: string | null;
};

export async function createExpenditure(f: ExpenditureFields, createdBy = "web-ui"): Promise<WriteResult> {
  const row = {
    project_id: f.projectId,
    spent_date: text(f.spentDate),
    // Blank means "belongs to no budget line" — fuel, food, taxis. Uppercased
    // so it matches the budget's normalised codes.
    item_code: text(f.itemCode)?.toUpperCase() ?? null,
    description: text(f.description),
    payer: (f.payer || "SHAO").toUpperCase(),
    amount: amount(f.amount),
    source: text(f.source),
    mobile_no: text(f.mobileNo),
    batch_no: text(f.batchNo),
    notes: text(f.notes),
    created_by: createdBy,
  };
  const { data, error } = await sb.from("project_expenditures").insert(row).select("id").single();
  if (!error) {
    await logRowCreated({
      projectId: f.projectId, entity: "expenditure", entityId: data?.id as number,
      label: row.item_code ?? row.description ?? row.payer, row, by: createdBy,
    });
  }
  if (error) {
    console.error("[expenditures] create failed:", error.message, row);
    if (error.code === "23503") {
      return {
        ok: false,
        error: `“${row.item_code}” is not on this project's budget. Leave the item blank if this spending belongs to no budget line.`,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id as number };
}

export async function deleteExpenditure(id: number): Promise<WriteResult> {
  const before = await snapshotRow("project_expenditures", id);
  const { error } = await sb.from("project_expenditures").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await logProjectChange({
      projectId: before.project_id as number, entity: "expenditure", entityId: id,
      label: (before.item_code as string | null) ?? (before.description as string | null) ?? (before.payer as string),
      action: "deleted", field: "amount", oldValue: before.amount,
    });
  }
  return { ok: true, id };
}

/** Total actually spent — the honest "actual cost" for the project record. */
export async function totalSpent(projectId: number): Promise<number | null> {
  const { data } = await sb.from("project_expenditures").select("amount").eq("project_id", projectId);
  if (!data || data.length === 0) return null;
  return data.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
