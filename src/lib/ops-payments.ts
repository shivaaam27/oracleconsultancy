// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// One row is one payment out. The client half is `ops-payments-shared.ts`, and
// every balance, advance and ageing band lives there — nothing derived is
// stored.
//
// ⚠️ NOTHING IS REQUIRED BUT AN AMOUNT. A payment may name a payee and no
// invoice, or an invoice and no payee, or carry only the reference somebody
// wrote on the transfer. That is how IMP PMT AND FREIGHT is actually kept.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, fetchAllRows } from "@/db/supabase";
// ⚠️ Shared with every other ops writer: a re-save must not report a change
// nobody made. See its comment in `ops-orders.ts`.
import { sameAuditValue } from "@/lib/ops-orders";
import type { Payment } from "@/lib/ops-payments-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type.
const COLS = "id,company_id,payee,kind,paid_date,amount,currency,ex_rate,reference,order_line_id,shipment_id,notes,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Payment {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    payee: s("payee"),
    kind: s("kind"),
    paidDate: s("paid_date"),
    amount: s("amount"),
    currency: s("currency"),
    exRate: s("ex_rate"),
    reference: s("reference"),
    orderLineId: (r.order_line_id as number | null) ?? null,
    shipmentId: (r.shipment_id as number | null) ?? null,
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

export async function listPayments(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<Payment[]> {
  // ⚠️ Every page, not the first thousand. PostgREST caps a plain select at
  // 1,000 rows and says nothing; importing the workbook put 2,600 enquiries in
  // and this returned 1,000 of them, silently. See `fetchAllRows`.
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("ops_payments").select(COLS).eq("company_id", companyId);
    if (!opts.includeArchived) q = q.eq("archived", false);
    return q
      .order("paid_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

/** Payments grouped by the order line they are against. */
export function paymentsByLine(payments: Payment[]): Map<number, Payment[]> {
  const m = new Map<number, Payment[]>();
  for (const p of payments) {
    if (p.orderLineId === null) continue;
    const b = m.get(p.orderLineId);
    if (b) b.push(p); else m.set(p.orderLineId, [p]);
  }
  return m;
}

/** Payments grouped by the shipment they are against. */
export function paymentsByShipment(payments: Payment[]): Map<number, Payment[]> {
  const m = new Map<number, Payment[]>();
  for (const p of payments) {
    if (p.shipmentId === null) continue;
    const b = m.get(p.shipmentId);
    if (b) b.push(p); else m.set(p.shipmentId, [p]);
  }
  return m;
}

/** The ones attached to nothing. ⚠️ Reported, not hidden — a payment against no
 *  invoice is money out that nobody has matched up, which is worth seeing. */
export function loosePayments(payments: Payment[]): Payment[] {
  return payments.filter((p) => p.orderLineId === null && p.shipmentId === null);
}

/** The values already used in a field, so the box can suggest them. */
export async function usedPaymentValues(
  companyId: number, column: string, limit = 200,
): Promise<string[]> {
  const { data } = await sb
    .from("ops_payments").select(column).eq("company_id", companyId).limit(3000);
  const seen = new Map<string, number>();
  // ⚠️ `as unknown as` first: a dynamic column name defeats supabase-js's
  // type-level parser.
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const v = row[column];
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

/* ─────────────────────────────────────────────────────────────── writing ─── */

export type PaymentFields = {
  companyId: number;
  payee?: string | null;
  kind?: string | null;
  paidDate?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  exRate?: string | number | null;
  reference?: string | null;
  orderLineId?: number | null;
  shipmentId?: number | null;
  notes?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function amountOf(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function toRow(f: Partial<PaymentFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  if (f.payee !== undefined) put("payee", text(f.payee));
  if (f.kind !== undefined) put("kind", text(f.kind));
  if (f.paidDate !== undefined) put("paid_date", text(f.paidDate));
  if (f.amount !== undefined) put("amount", amountOf(f.amount));
  if (f.currency !== undefined) put("currency", text(f.currency));
  if (f.exRate !== undefined) put("ex_rate", amountOf(f.exRate));
  if (f.reference !== undefined) put("reference", text(f.reference));
  if (f.orderLineId !== undefined) put("order_line_id", f.orderLineId);
  if (f.shipmentId !== undefined) put("shipment_id", f.shipmentId);
  if (f.notes !== undefined) put("notes", text(f.notes));
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
    // ⚠️ Swallowed on purpose. A missing audit line is a gap; a refused payment
    // is a lie about money that left the account.
    console.error("[ops audit] write threw:", err);
  }
}

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
};

/* ──────────────────────────────────────────────────────────────── writes ─── */

export async function createPayment(f: PaymentFields, createdBy = "web-ui"): Promise<WriteResult> {
  const row: Record<string, unknown> = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  // ⚠️ The ONE thing a payment cannot be without. Everything else — who, what
  // for, against which invoice — can be filled in afterwards.
  if (row.amount === null || row.amount === undefined) {
    return { ok: false, error: "Say how much was paid." };
  }

  const { data, error } = await sb.from("ops_payments").insert(row).select("id").single();
  if (error) {
    console.error("[ops payments] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "payment", entity_id: id,
    label: asText(row.reference) ?? asText(row.payee), action: "created",
    new_value: filled.join(", ") || null, created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updatePayment(
  id: number, patch: Partial<PaymentFields>, by = "web-ui",
): Promise<WriteResult> {
  const row: Record<string, unknown> = { ...toRow(patch), updated_at: new Date().toISOString() };
  const { data: before } = await sb.from("ops_payments").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_payments").update(row).eq("id", id);
  if (error) {
    console.error("[ops payments] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  if (before) {
    const b = before as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "payment", entity_id: id,
        label: asText(b.reference) ?? asText(b.payee), action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      }));
    await log(entries);
  }
  return { ok: true, id };
}

/** Archive, never delete — the money really did leave the account. */
export async function archivePayment(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_payments").select("company_id,reference,payee").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_payments").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "payment", entity_id: id,
      label: asText(before.reference) ?? asText(before.payee),
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}
