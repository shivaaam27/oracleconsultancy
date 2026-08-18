// ─────────────────────────────────────────────────────────────────────────────
// THE FUNNEL — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// One row is one enquiry, as INFO - RFQ keeps it. The client half is
// `ops-funnel-shared.ts`, and every count, rate, value and countdown lives
// there — nothing derived is stored.
//
// ⚠️ NOTHING IS FILLED IN FOR THE OWNER. No date, no value, no outcome. An
// enquiry that has only a number and a client is a real enquiry and saves.
//
// ⚠️ THE ORDER'S VALUE IS NOT WRITTEN HERE. The row names a PO; its value is
// read from the order lines carrying that number. This is the one place the
// workbook duplicates a figure across two sheets, and the two disagree.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
// ⚠️ Shared with the order lines and the shipments: a re-save must not report
// a change nobody made. See its comment in `ops-orders.ts`.
import { sameAuditValue } from "@/lib/ops-orders";
import type { Enquiry } from "@/lib/ops-funnel-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type (learned in lib/projects.ts).
const COLS = "id,company_id,rfq_no,rfq_date,client,description,assigned_to,quotation_no,quotation_date,quote_currency,quote_value,quote_ex_rate,po_no,outcome,outcome_reason,remarks,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Enquiry {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    rfqNo: r.rfq_no as string,
    rfqDate: s("rfq_date"),
    client: s("client"),
    description: s("description"),
    assignedTo: s("assigned_to"),
    quotationNo: s("quotation_no"),
    quotationDate: s("quotation_date"),
    quoteCurrency: s("quote_currency"),
    quoteValue: s("quote_value"),
    quoteExRate: s("quote_ex_rate"),
    poNo: s("po_no"),
    outcome: s("outcome"),
    outcomeReason: s("outcome_reason"),
    remarks: s("remarks"),
    archived: Boolean(r.archived),
  };
}

export async function listEnquiries(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<Enquiry[]> {
  let q = sb.from("ops_enquiries").select(COLS).eq("company_id", companyId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q
    .order("rfq_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getEnquiry(id: number): Promise<Enquiry | null> {
  const { data } = await sb.from("ops_enquiries").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** The values already used in a field, so the box can suggest them.
 *
 *  The same "middle path" the order lines use: keep typing free text, but offer
 *  what has been typed before so one person does not become three spellings.
 *  It SUGGESTS. It never fills anything in. */
export async function usedEnquiryValues(
  companyId: number, column: string, limit = 400,
): Promise<string[]> {
  const { data } = await sb
    .from("ops_enquiries").select(column).eq("company_id", companyId).limit(3000);
  const seen = new Map<string, number>();
  // ⚠️ `as unknown as` first: a dynamic column name defeats supabase-js's
  // type-level parser, so the row type comes back as GenericStringError.
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const v = row[column];
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

/* ─────────────────────────────────────────────────────────────── writing ─── */

export type EnquiryFields = {
  companyId: number;
  rfqNo: string;
  rfqDate?: string | null;
  client?: string | null;
  description?: string | null;
  assignedTo?: string | null;
  quotationNo?: string | null;
  quotationDate?: string | null;
  quoteCurrency?: string | null;
  quoteValue?: string | number | null;
  quoteExRate?: string | number | null;
  poNo?: string | null;
  outcome?: string | null;
  outcomeReason?: string | null;
  remarks?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** A number, or null. ⚠️ Blank stays BLANK — never 0. A quote nobody has valued
 *  is not a quote for nothing, and it is the second reading that makes a total
 *  lie. */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

function toRow(f: Partial<EnquiryFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => { if (value !== undefined) row[key] = value; };

  if (f.rfqNo !== undefined) put("rfq_no", (f.rfqNo ?? "").trim());
  if (f.rfqDate !== undefined) put("rfq_date", text(f.rfqDate));
  if (f.client !== undefined) put("client", text(f.client));
  if (f.description !== undefined) put("description", text(f.description));
  if (f.assignedTo !== undefined) put("assigned_to", text(f.assignedTo));
  if (f.quotationNo !== undefined) put("quotation_no", text(f.quotationNo));
  if (f.quotationDate !== undefined) put("quotation_date", text(f.quotationDate));
  if (f.quoteCurrency !== undefined) put("quote_currency", text(f.quoteCurrency));
  if (f.quoteValue !== undefined) put("quote_value", amount(f.quoteValue));
  if (f.quoteExRate !== undefined) put("quote_ex_rate", amount(f.quoteExRate));
  if (f.poNo !== undefined) put("po_no", text(f.poNo));
  if (f.outcome !== undefined) put("outcome", text(f.outcome));
  if (f.outcomeReason !== undefined) put("outcome_reason", text(f.outcomeReason));
  if (f.remarks !== undefined) put("remarks", text(f.remarks));
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
    // enquiry is a lie about the day's work.
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

export async function createEnquiry(f: EnquiryFields, createdBy = "web-ui"): Promise<WriteResult> {
  const rfqNo = (f.rfqNo ?? "").trim();
  if (!rfqNo) return { ok: false, error: "Give the enquiry its RFQ number." };

  const row = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  const { data, error } = await sb.from("ops_enquiries").insert(row).select("id").single();
  if (error) {
    console.error("[ops funnel] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "enquiry", entity_id: id,
    label: rfqNo, action: "created", new_value: filled.join(", ") || null, created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updateEnquiry(
  id: number, patch: Partial<EnquiryFields>, by = "web-ui",
): Promise<WriteResult> {
  const row = { ...toRow(patch), updated_at: new Date().toISOString() };

  // Read first — after the update the old figure is gone, and "what was it
  // before?" is the whole question the trail exists to answer.
  const { data: before } = await sb.from("ops_enquiries").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_enquiries").update(row).eq("id", id);
  if (error) {
    console.error("[ops funnel] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }

  if (before) {
    const b = before as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "enquiry", entity_id: id,
        label: (b.rfq_no as string) ?? null, action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      }));
    await log(entries);
  }
  return { ok: true, id };
}

/** Archive, never delete — a client really did ask, and the funnel is a count
 *  of what they asked for. */
export async function archiveEnquiry(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_enquiries").select("company_id,rfq_no").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_enquiries")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "enquiry", entity_id: id,
      label: (before.rfq_no as string) ?? null,
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}
