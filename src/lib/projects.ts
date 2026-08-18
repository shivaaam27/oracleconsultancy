// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL PROJECTS — reading and writing the record (Phase 1).
//
// ⚠️ SERVER-ONLY. This imports `sb` (the service-role Supabase client). A client
// component that value-imports this file drags the service key into the browser
// bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY is not set". The
// client half is `lib/projects-shared.ts` — pure arithmetic, no imports. That
// split is a hard rule in CLAUDE.md and it has been broken before.
//
// Mirrors lib/commitments.ts: a `WriteResult` that either succeeds or reports
// the database's own error, so a failed write can never be mistaken for a
// successful one.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { logProjectChange, logRowCreated, logRowUpdate, snapshotRow } from "@/lib/project-audit";
import { reindexEntity } from "@/lib/index-hooks";
import {
  programme, contract, num,
  type ProjectInput, type Programme, type Contract,
} from "@/lib/projects-shared";
// The Bill of Quantities total, which is what turns the profit figures on.
// No cycle: project-budget.ts imports only the SHARED half of this pair.
import { budgetTotal, budgetTotals } from "@/lib/project-budget";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ ONE STRING LITERAL, on one line, however long. supabase-js parses this at
// the TYPE level to work out the row shape; split across lines with `+` it
// widens to `string`, the parser gives up, and every row comes back typed as
// `GenericStringError` instead of your columns.
const COLS = "id,company_id,name,variant,client,location,po_number,start_date,duration_days,quotation_value,po_value,additional_work,vat_rate,wht_rate,completion_pct,meal_rate,currency,status,notes,archived,created_by,created_at,updated_at";

/**
 * One project as the screens see it: the stored fields, the company's name, and
 * the derived figures already worked out.
 *
 * The derived half is computed here on every read rather than stored — see the
 * header of projects-shared.ts for why. It costs nothing (it is arithmetic on
 * one row) and it cannot go stale.
 */
export type Project = ProjectInput & {
  id: number;
  companyId: number;
  companyName: string | null;
  name: string;
  variant: string | null;
  client: string | null;
  location: string | null;
  poNumber: string | null;
  status: string;
  notes: string | null;
  archived: boolean;
  /** Cost of feeding one person for one day — Phase 6. */
  mealRate: string | null;
  /** The one currency this project is priced and paid in. */
  currency: string;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Worked out, never stored. */
  programme: Programme;
  contract: Contract;
};

function mapRow(r: Record<string, unknown>, nameById: Map<number, string>, budget?: number | null): Project {
  const companyId = r.company_id as number;
  // The stored half, in the shape projects-shared.ts expects. Money arrives from
  // Postgres `numeric` as a STRING and is deliberately left as one here — `num()`
  // converts at the point of use, so nothing rounds on the way through.
  const input: ProjectInput = {
    startDate: (r.start_date as string | null) ?? null,
    durationDays: (r.duration_days as number | null) ?? null,
    quotationValue: (r.quotation_value as string | null) ?? null,
    poValue: (r.po_value as string | null) ?? null,
    additionalWork: (r.additional_work as string | null) ?? null,
    vatRate: (r.vat_rate as string | null) ?? null,
    whtRate: (r.wht_rate as string | null) ?? null,
    completionPct: (r.completion_pct as string | null) ?? null,
  };
  return {
    ...input,
    id: r.id as number,
    companyId,
    companyName: nameById.get(companyId) ?? null,
    name: r.name as string,
    variant: (r.variant as string | null) ?? null,
    client: (r.client as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    poNumber: (r.po_number as string | null) ?? null,
    mealRate: (r.meal_rate as string | null) ?? null,
    currency: (r.currency as string | null) ?? "TZS",
    status: (r.status as string | null) ?? "Active",
    notes: (r.notes as string | null) ?? null,
    archived: Boolean(r.archived),
    createdBy: (r.created_by as string | null) ?? "web-ui",
    createdAt: (r.created_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
    // `budget` is the Bill of Quantities total (Phase 2). It is UNDEFINED until
    // the project has budget lines, and every figure needing it then comes back
    // null so the screen can say so. Passing 0 would invent a 100% margin.
    programme: programme(input),
    contract: contract(input, { budget: budget ?? null }),
  };
}

/** Every live project, newest start first, with its budget total resolved. */
export async function listProjects(opts: { includeArchived?: boolean } = {}): Promise<Project[]> {
  let q = sb.from("projects").select(COLS);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const [{ data }, { data: companies }] = await Promise.all([
    q.order("start_date", { ascending: false, nullsFirst: false }),
    sb.from("companies").select("id,name"),
  ]);
  const nameById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  const rows = data ?? [];
  // One query for every project's budget, not one per project.
  const budgets = await budgetTotals(rows.map((r) => r.id as number));
  return rows.map((r) => mapRow(r, nameById, budgets.get(r.id as number) ?? null));
}

/** One project, or null when the id does not exist. */
export async function getProject(id: number): Promise<Project | null> {
  const [{ data }, { data: companies }] = await Promise.all([
    sb.from("projects").select(COLS).eq("id", id).maybeSingle(),
    sb.from("companies").select("id,name"),
  ]);
  if (!data) return null;
  const nameById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  // The budget the profit figures are measured against — null until Phase 2
  // lines exist for this project.
  const budget = await budgetTotal(id);
  return mapRow(data as Record<string, unknown>, nameById, budget);
}

/* ──────────────────────────────────────────────────────────────── writes ─── */

/**
 * What a person may type. Every field except the company and the name is
 * optional, on purpose: a project is usually raised the moment it is won, when
 * the PO number and the programme are not yet known. A form that demands them
 * up front just gets filled with placeholder rubbish.
 */
export type ProjectFields = {
  companyId: number;
  name: string;
  variant?: string | null;
  client?: string | null;
  location?: string | null;
  poNumber?: string | null;
  startDate?: string | null;
  durationDays?: number | null;
  quotationValue?: string | number | null;
  poValue?: string | number | null;
  additionalWork?: string | number | null;
  vatRate?: string | number | null;
  whtRate?: string | number | null;
  completionPct?: string | number | null;
  mealRate?: string | number | null;
  currency?: string | null;
  status?: string | null;
  notes?: string | null;
};

/** Blank strings become null, so an empty box is "not known", never zero. */
function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** A typed amount as a stored decimal string, or null when the box was empty. */
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  // Tolerate what people actually type: "195,761,164.75" or "195 761 164.75".
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * A percentage typed as a percentage, stored as a fraction.
 *
 * The workbook stores 0.98 and formats it as 98%. People type "98". Accepting
 * both and storing one is the whole job here: anything above 1 is read as a
 * percentage, 1 or below as a fraction. The one ambiguous value is exactly 1 —
 * read as 100%, which is what someone typing "1" into a completion box means
 * far more often than 1%.
 */
function fraction(v: string | number | null | undefined): string | null {
  const n = num(typeof v === "string" ? v.replace(/[\s%]/g, "") : v ?? null);
  if (n === null) return null;
  const f = n > 1 ? n / 100 : n;
  return String(Math.max(0, Math.min(1, f)));
}

/**
 * ⚠️ THE THREE NOT NULL COLUMNS MUST BE OMITTED, NEVER SET TO NULL.
 *
 * `vat_rate`, `wht_rate` and `completion_pct` are `NOT NULL DEFAULT …`. A column
 * default applies only when the column is **left out of the INSERT** — sending
 * an explicit `null` is not "no value", it is the value null, and Postgres
 * rejects it:
 *
 *     null value in column "vat_rate" violates not-null constraint
 *
 * The form always submits a string for every box, so an untouched VAT field
 * arrives as `""`, becomes `null`, and killed the whole save. It cost the owner
 * a typed-in project: the form said only "Couldn't save the project", the row
 * never appeared, and nothing said which field was at fault.
 *
 * So these three keys are dropped when there is no value, and the database
 * default (0.18 / 0.10 / 0) does its job. On an UPDATE the same rule means an
 * empty box leaves the stored value alone rather than blanking it.
 */
function toRow(f: Partial<ProjectFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  /** Set a column, but drop it entirely when there is no value — for the three
   *  NOT NULL columns, so the database default applies. See the note above. */
  const setDefaulted = (key: string, value: string | null) => {
    if (value !== null) row[key] = value;
  };

  if (f.companyId !== undefined) row.company_id = f.companyId;
  if (f.name !== undefined) row.name = (f.name ?? "").trim();
  if (f.variant !== undefined) row.variant = text(f.variant);
  if (f.client !== undefined) row.client = text(f.client);
  if (f.location !== undefined) row.location = text(f.location);
  if (f.poNumber !== undefined) row.po_number = text(f.poNumber);
  if (f.startDate !== undefined) row.start_date = text(f.startDate);
  if (f.durationDays !== undefined) row.duration_days = f.durationDays ?? null;
  if (f.quotationValue !== undefined) row.quotation_value = amount(f.quotationValue);
  if (f.poValue !== undefined) row.po_value = amount(f.poValue);
  if (f.additionalWork !== undefined) row.additional_work = amount(f.additionalWork);
  if (f.vatRate !== undefined) setDefaulted("vat_rate", fraction(f.vatRate));
  if (f.whtRate !== undefined) setDefaulted("wht_rate", fraction(f.whtRate));
  if (f.completionPct !== undefined) setDefaulted("completion_pct", fraction(f.completionPct));
  if (f.mealRate !== undefined) row.meal_rate = amount(f.mealRate);
  if (f.currency !== undefined) row.currency = text(f.currency) ?? "TZS";
  if (f.status !== undefined) row.status = text(f.status) ?? "Active";
  if (f.notes !== undefined) row.notes = text(f.notes);
  return row;
}

export async function createProject(f: ProjectFields, createdBy = "web-ui"): Promise<WriteResult> {
  const row = { ...toRow(f), created_by: createdBy };
  const { data, error } = await sb.from("projects").insert(row).select("id").single();
  if (error) {
    // Logged in full: the caller shows a friendly line, but a silent failure
    // with no trace anywhere is what made the NOT NULL bug above so expensive.
    console.error("[projects] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  const id = data?.id as number;
  await logRowCreated({ projectId: id, entity: "project", entityId: id, label: f.name, row, by: createdBy });
  void reindexEntity("project", id); // best-effort, never throws
  return { ok: true, id };
}

export async function updateProject(id: number, patch: Partial<ProjectFields>): Promise<WriteResult> {
  const row = { ...toRow(patch), updated_at: new Date().toISOString() };
  // Read first: after the update the old figure is gone, and "what was it
  // before?" is the whole question the trail exists to answer.
  const before = await snapshotRow("projects", id);
  const { error } = await sb.from("projects").update(row).eq("id", id);
  if (error) {
    console.error("[projects] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  await logRowUpdate({
    projectId: id, entity: "project", entityId: id,
    label: (before?.name as string | null) ?? null, before, patch: row,
  });
  void reindexEntity("project", id);
  return { ok: true, id };
}

/**
 * Archive, never delete.
 *
 * A project carries the requisitions, payments and expenditure of a real job;
 * deleting one would take the audit trail with it. This is the same line the
 * rest of COS holds ("Delete it" → archive it, CLAUDE.md).
 */
export async function archiveProject(id: number, archived = true): Promise<WriteResult> {
  const { error } = await sb
    .from("projects")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logProjectChange({
    projectId: id, entity: "project", entityId: id,
    action: archived ? "archived" : "restored",
  });
  // Re-stamps lifecycle="history" rather than deleting the row — archived
  // projects still turn up under "Include history".
  void reindexEntity("project", id);
  return { ok: true, id };
}
