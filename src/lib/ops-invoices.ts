// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY & BILLING — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// One record is one despatch: what went out, and what was billed for it. The
// client half is `ops-invoices-shared.ts`, and every total, balance and
// countdown lives there — nothing derived is stored.
//
// ⚠️ NOTHING IS FILLED IN FOR THE OWNER. A delivery note with a date and no
// invoice is a real record and saves; that is the whole point of splitting the
// sheet's single "INV/DEL DATE" column in two.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
// ⚠️ Shared with the order lines and the shipments: a re-save must not report
// a change nobody made. See its comment in `ops-orders.ts`.
import { sameAuditValue } from "@/lib/ops-orders";
import type { Invoice } from "@/lib/ops-invoices-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type (learned in lib/projects.ts).
const COLS = "id,company_id,delivery_note_no,delivered_date,invoice_no,invoice_date,invoice_value,invoice_currency,ex_rate,client,status,pending_with,notes,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Invoice {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    deliveryNoteNo: s("delivery_note_no"),
    deliveredDate: s("delivered_date"),
    invoiceNo: s("invoice_no"),
    invoiceDate: s("invoice_date"),
    invoiceValue: s("invoice_value"),
    invoiceCurrency: s("invoice_currency"),
    exRate: s("ex_rate"),
    client: s("client"),
    status: s("status"),
    pendingWith: s("pending_with"),
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

export async function listInvoices(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<Invoice[]> {
  let q = sb.from("ops_invoices").select(COLS).eq("company_id", companyId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q
    .order("delivered_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** How many order lines are on each despatch. A document with none is a clue,
 *  not a mistake to hide — the same rule the shipments screen follows. */
export async function linesPerInvoice(companyId: number): Promise<Map<number, number>> {
  const { data } = await sb
    .from("ops_order_lines").select("invoice_id")
    .eq("company_id", companyId).eq("archived", false)
    .not("invoice_id", "is", null);
  const out = new Map<number, number>();
  for (const r of data ?? []) {
    const id = r.invoice_id as number | null;
    if (id === null) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────── writing ─── */

export type InvoiceFields = {
  companyId: number;
  deliveryNoteNo?: string | null;
  deliveredDate?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  invoiceValue?: string | number | null;
  invoiceCurrency?: string | null;
  exRate?: string | number | null;
  client?: string | null;
  status?: string | null;
  pendingWith?: string | null;
  notes?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** A number, or null. ⚠️ Blank stays BLANK — never 0. An invoice nobody has
 *  valued is not an invoice for nothing. */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function toRow(f: Partial<InvoiceFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => { if (value !== undefined) row[key] = value; };

  if (f.deliveryNoteNo !== undefined) put("delivery_note_no", text(f.deliveryNoteNo));
  if (f.deliveredDate !== undefined) put("delivered_date", text(f.deliveredDate));
  if (f.invoiceNo !== undefined) put("invoice_no", text(f.invoiceNo));
  if (f.invoiceDate !== undefined) put("invoice_date", text(f.invoiceDate));
  if (f.invoiceValue !== undefined) put("invoice_value", amount(f.invoiceValue));
  if (f.invoiceCurrency !== undefined) put("invoice_currency", text(f.invoiceCurrency));
  if (f.exRate !== undefined) put("ex_rate", amount(f.exRate));
  if (f.client !== undefined) put("client", text(f.client));
  if (f.status !== undefined) put("status", text(f.status));
  if (f.pendingWith !== undefined) put("pending_with", text(f.pendingWith));
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
    // ⚠️ Swallowed on purpose. A missing audit line is a gap; a refused
    // delivery record is a lie about the day's work.
    console.error("[ops audit] write threw:", err);
  }
}

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** The label a trail entry carries — whichever reference the record has. */
function labelOf(r: { invoice_no?: unknown; delivery_note_no?: unknown }): string | null {
  return asText(r.invoice_no) ?? asText(r.delivery_note_no);
}

/* ──────────────────────────────────────────────────────────────── writes ─── */

export async function createInvoice(f: InvoiceFields, createdBy = "web-ui"): Promise<WriteResult> {
  const row: Record<string, unknown> = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  // ⚠️ ONE of the two references, not both. A delivery going out today has no
  // invoice number yet, and an invoice raised from the office may never have
  // had a delivery note — but a record with neither cannot be found again.
  if (!row.invoice_no && !row.delivery_note_no) {
    return { ok: false, error: "Give it a delivery note number or an invoice number." };
  }

  const { data, error } = await sb.from("ops_invoices").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Invoice ${row.invoice_no} is already recorded.` };
    }
    console.error("[ops invoices] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "invoice", entity_id: id,
    label: labelOf(row), action: "created", new_value: filled.join(", ") || null,
    created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updateInvoice(
  id: number, patch: Partial<InvoiceFields>, by = "web-ui",
): Promise<WriteResult> {
  const row: Record<string, unknown> = { ...toRow(patch), updated_at: new Date().toISOString() };

  // Read first — after the update the old figure is gone, and "what was it
  // before?" is the whole question the trail exists to answer.
  const { data: before } = await sb.from("ops_invoices").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_invoices").update(row).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Invoice ${row.invoice_no} is already recorded.` };
    }
    console.error("[ops invoices] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  if (before) {
    const b = before as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "invoice", entity_id: id,
        label: labelOf(b), action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      }));
    await log(entries);
  }
  return { ok: true, id };
}

/** Archive, never delete — goods really did go out and somebody was really
 *  billed. The lines pointing at it are released, so they can be put on the
 *  right document instead of pointing at one nobody can see. */
export async function archiveInvoice(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_invoices").select("company_id,invoice_no,delivery_note_no").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_invoices")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (archived) {
    const { error: e } = await sb
      .from("ops_order_lines").update({ invoice_id: null }).eq("invoice_id", id);
    if (e) console.error("[ops invoices] releasing lines failed:", e.message);
  }
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "invoice", entity_id: id,
      label: labelOf(before as Record<string, unknown>),
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}

/**
 * Put an order line on a despatch, or take it off.
 *
 * ⚠️ Copies NOTHING onto the line. The delivery date, the invoice number and
 * what was billed stay on the document and are read from there — which is the
 * whole reason the document exists.
 */
export async function setLineInvoice(
  lineId: number, invoiceId: number | null, by = "web-ui",
): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_order_lines").select("company_id,po_no,invoice_id").eq("id", lineId).maybeSingle();
  const { error } = await sb
    .from("ops_order_lines")
    .update({ invoice_id: invoiceId, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) return { ok: false, error: error.message };

  if (before && (before.invoice_id ?? null) !== invoiceId) {
    await log([{
      company_id: before.company_id as number, entity: "order_line", entity_id: lineId,
      label: (before.po_no as string) ?? null, action: "updated", field: "invoice_id",
      old_value: asText(before.invoice_id), new_value: asText(invoiceId), created_by: by,
    }]);
  }
  return { ok: true, id: lineId };
}
