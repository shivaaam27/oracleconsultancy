import { sb } from "@/db/supabase";
import {
  type Fact,
  type FactEntityType,
  type FactValue,
  renderFactValue,
} from "@/lib/facts-shared";

// Server-side data layer for the append-only fact ledger. The CURRENT value of
// an entity+field is the row with the latest effectiveDate; older rows are kept
// as history. Recording a change ADDS a row — it never edits an old one.

export type { Fact } from "@/lib/facts-shared";

const COLS =
  "id,entity_type,person_id,company_id,field,value,display,effective_date,source,document_id,source_hash,verified,verified_at,note,created_by,created_at";

function mapRow(r: Record<string, unknown>): Fact {
  return {
    id: r.id as number,
    entityType: r.entity_type as FactEntityType,
    personId: (r.person_id as number | null) ?? null,
    companyId: (r.company_id as number | null) ?? null,
    field: r.field as string,
    value: r.value as FactValue,
    display: (r.display as string | null) ?? null,
    effectiveDate: r.effective_date as string,
    source: (r.source as string | null) ?? null,
    documentId: (r.document_id as number | null) ?? null,
    sourceHash: (r.source_hash as string | null) ?? null,
    verified: Boolean(r.verified),
    verifiedAt: (r.verified_at as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export type EntityRef = { type: FactEntityType; id: number };

/** All facts for one entity, newest effective_date first. */
export async function listFacts(entity: EntityRef): Promise<Fact[]> {
  const col = entity.type === "person" ? "person_id" : "company_id";
  const { data } = await sb
    .from("facts")
    .select(COLS)
    .eq(col, entity.id)
    .order("effective_date", { ascending: false })
    .order("id", { ascending: false });
  return (data ?? []).map(mapRow);
}

/**
 * The current value of each field for an entity — one fact per field, the one
 * with the latest effective_date (ties broken by newest id). Returns them sorted
 * by field name for stable display.
 */
export async function currentFacts(entity: EntityRef): Promise<Fact[]> {
  const all = await listFacts(entity); // already newest-first
  const seen = new Set<string>();
  const current: Fact[] = [];
  for (const f of all) {
    if (seen.has(f.field)) continue; // first occurrence = latest effective_date
    seen.add(f.field);
    current.push(f);
  }
  return current.sort((a, b) => a.field.localeCompare(b.field));
}

/** Full history of one field for an entity, newest first. */
export async function factHistory(entity: EntityRef, field: string): Promise<Fact[]> {
  return (await listFacts(entity)).filter((f) => f.field === field);
}

export interface RecordFactInput {
  entity: EntityRef;
  field: string;
  value: FactValue;
  /** Optional explicit rendering; computed from value when omitted. */
  display?: string | null;
  /** Defaults to now. */
  effectiveDate?: Date | string;
  source?: string | null;
  documentId?: number | null;
  sourceHash?: string | null;
  /** A fact created from a confirmed source can be marked verified at birth. */
  verified?: boolean;
  note?: string | null;
  createdBy?: string;
}

/**
 * Append a new fact. Never mutates an existing row — a change is a new entry,
 * and currentFacts() will surface it as the live value. Best-effort: a failed
 * write returns null rather than throwing into the caller's action.
 */
export async function recordFact(input: RecordFactInput): Promise<Fact | null> {
  const effective = input.effectiveDate
    ? new Date(input.effectiveDate).toISOString()
    : new Date().toISOString();
  const verified = input.verified ?? false;
  const row = {
    entity_type: input.entity.type,
    person_id: input.entity.type === "person" ? input.entity.id : null,
    company_id: input.entity.type === "company" ? input.entity.id : null,
    field: input.field.trim(),
    value: input.value,
    display: input.display ?? renderFactValue(input.field, input.value),
    effective_date: effective,
    source: input.source ?? null,
    document_id: input.documentId ?? null,
    source_hash: input.sourceHash ?? null,
    verified,
    verified_at: verified ? new Date().toISOString() : null,
    note: input.note ?? null,
    created_by: input.createdBy ?? "web-ui",
    created_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from("facts").insert(row).select(COLS).single();
  if (error || !data) return null;
  return mapRow(data);
}

/**
 * Mark a fact verified (or un-verify it). Verifying stamps verified_at to now so
 * the 180-day staleness clock restarts. This is the ONE allowed in-place edit —
 * it confirms a fact, it does not change its value.
 */
export async function setFactVerified(id: number, verified: boolean, createdBy = "web-ui"): Promise<void> {
  await sb
    .from("facts")
    .update({ verified, verified_at: verified ? new Date().toISOString() : null })
    .eq("id", id);
  void createdBy; // reserved for a future fact-events audit trail
}

/**
 * Hard-delete a fact — only for correcting a mistaken entry (a typo'd row), not
 * for retiring a value (that's done by recording a newer one). Append-only is
 * about never overwriting history, not about being unable to undo a slip.
 */
export async function deleteFact(id: number): Promise<void> {
  await sb.from("facts").delete().eq("id", id);
}
