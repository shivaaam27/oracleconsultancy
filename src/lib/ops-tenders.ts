// ─────────────────────────────────────────────────────────────────────────────
// TENDERS — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// The client half is `ops-tenders-shared.ts`. One row is one bid being chased.
// ⚠️ Only the description is required — a tender you have heard about and
// nothing else is still worth writing down.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { sameAuditValue } from "@/lib/ops-orders";
import type { Tender } from "@/lib/ops-tenders-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

const COLS = "id,company_id,description,client,quote_type,deadline,outcome,outcome_reason,submitted_date,enquiry_id,notes,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): Tender {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    description: r.description as string,
    client: s("client"),
    quoteType: s("quote_type"),
    deadline: s("deadline"),
    outcome: s("outcome"),
    outcomeReason: s("outcome_reason"),
    submittedDate: s("submitted_date"),
    enquiryId: (r.enquiry_id as number | null) ?? null,
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

export async function listTenders(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<Tender[]> {
  let q = sb.from("ops_tenders").select(COLS).eq("company_id", companyId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  // Soonest deadline first — a bid list is read to find what closes next.
  const { data } = await q
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export type TenderFields = {
  companyId: number;
  description: string;
  client?: string | null;
  quoteType?: string | null;
  deadline?: string | null;
  outcome?: string | null;
  outcomeReason?: string | null;
  submittedDate?: string | null;
  enquiryId?: number | null;
  notes?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function toRow(f: Partial<TenderFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  if (f.description !== undefined) put("description", (f.description ?? "").trim());
  if (f.client !== undefined) put("client", text(f.client));
  if (f.quoteType !== undefined) put("quote_type", text(f.quoteType));
  if (f.deadline !== undefined) put("deadline", text(f.deadline));
  if (f.outcome !== undefined) put("outcome", text(f.outcome));
  if (f.outcomeReason !== undefined) put("outcome_reason", text(f.outcomeReason));
  if (f.submittedDate !== undefined) put("submitted_date", text(f.submittedDate));
  if (f.enquiryId !== undefined) put("enquiry_id", f.enquiryId);
  if (f.notes !== undefined) put("notes", text(f.notes));
  return row;
}

const NOISE = new Set(["updated_at", "created_at", "created_by", "company_id", "id"]);

async function log(entries: Array<Record<string, unknown>>): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await sb.from("ops_audit").insert(entries);
    if (error) console.error("[ops audit] write failed:", error.message);
  } catch (err) {
    console.error("[ops audit] write threw:", err);
  }
}

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
};

export async function createTender(f: TenderFields, createdBy = "web-ui"): Promise<WriteResult> {
  const description = (f.description ?? "").trim();
  if (!description) return { ok: false, error: "Say what the tender is for." };

  const row: Record<string, unknown> = { ...toRow(f), company_id: f.companyId, created_by: createdBy };
  const { data, error } = await sb.from("ops_tenders").insert(row).select("id").single();
  if (error) {
    console.error("[ops tenders] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  const filled = Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && asText(v) !== null)
    .map(([k, v]) => `${k}=${asText(v)}`);
  await log([{
    company_id: f.companyId, entity: "tender", entity_id: id,
    label: description.slice(0, 80), action: "created",
    new_value: filled.join(", ") || null, created_by: createdBy,
  }]);
  return { ok: true, id };
}

export async function updateTender(
  id: number, patch: Partial<TenderFields>, by = "web-ui",
): Promise<WriteResult> {
  const row: Record<string, unknown> = { ...toRow(patch), updated_at: new Date().toISOString() };
  const { data: before } = await sb.from("ops_tenders").select("*").eq("id", id).maybeSingle();
  const { error } = await sb.from("ops_tenders").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    const b = before as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([k]) => !NOISE.has(k) && k !== "updated_at")
      .filter(([k, v]) => !sameAuditValue(b[k], v))
      .map(([k, v]) => ({
        company_id: b.company_id as number, entity: "tender", entity_id: id,
        label: String(b.description ?? "").slice(0, 80), action: "updated",
        field: k, old_value: asText(b[k]), new_value: asText(v), created_by: by,
      }));
    await log(entries);
  }
  return { ok: true, id };
}

/** Archive, never delete — a bid we chased is part of the record. */
export async function archiveTender(id: number, archived = true, by = "web-ui"): Promise<WriteResult> {
  const { data: before } = await sb
    .from("ops_tenders").select("company_id,description").eq("id", id).maybeSingle();
  const { error } = await sb
    .from("ops_tenders").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before) {
    await log([{
      company_id: before.company_id as number, entity: "tender", entity_id: id,
      label: String(before.description ?? "").slice(0, 80),
      action: archived ? "archived" : "restored", created_by: by,
    }]);
  }
  return { ok: true, id };
}
