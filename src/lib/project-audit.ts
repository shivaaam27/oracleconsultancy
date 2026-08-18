// ─────────────────────────────────────────────────────────────────────────────
// PROJECT AUDIT — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// The workbook has no answer to "who changed this figure, and what was it
// before?" — a cell is retyped and the old number is gone. Every project write
// path logs here instead, one row per FIELD that actually moved.
//
// ⚠️ THE TRAIL MUST NEVER BREAK THE WRITE. Logging failures are swallowed and
// printed to the console: a full disk or a slow link must not stop someone
// recording that money went out. A missing audit line is a gap; a refused
// payment entry is a lie about the day's work.
//
// ⚠️ Append-only. There is no update and no delete here on purpose. When a row
// is deleted from a sheet its trail STAYS — that is the point of it.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import type { AuditRow } from "@/lib/project-audit-shared";

type Entry = {
  projectId: number;
  entity: string;
  entityId?: number | null;
  label?: string | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  by?: string;
};

/** Everything is stored as text — a trail is read, not recalculated. */
function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Columns that say nothing about what a person did. */
const NOISE = new Set(["updated_at", "created_at", "created_by", "project_id", "id", "sort_order", "approved_at"]);

export async function logProjectChanges(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const rows = entries.map((e) => ({
      project_id: e.projectId,
      entity: e.entity,
      entity_id: e.entityId ?? null,
      label: asText(e.label),
      action: e.action,
      field: e.field ?? null,
      old_value: asText(e.oldValue),
      new_value: asText(e.newValue),
      created_by: e.by ?? "web-ui",
    }));
    const { error } = await sb.from("project_audit").insert(rows);
    if (error) console.error("[project audit] write failed:", error.message);
  } catch (err) {
    console.error("[project audit] write threw:", err);
  }
}

export async function logProjectChange(entry: Entry): Promise<void> {
  await logProjectChanges([entry]);
}

/**
 * The row as it stands, so a change can be recorded as old → new.
 *
 * ⚠️ Call this BEFORE the update. Reading afterwards would record the new value
 * twice and the trail would say nothing changed.
 */
export async function snapshotRow(table: string, id: number): Promise<Record<string, unknown> | null> {
  const { data } = await sb.from(table).select("*").eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Diff a database patch against the row it is about to replace, and log one
 * entry per field that genuinely moved. Values are compared as text, so "1500"
 * and 1500 count as the same figure rather than a phantom edit.
 */
export async function logRowUpdate(opts: {
  projectId: number;
  entity: string;
  entityId: number;
  label?: string | null;
  before: Record<string, unknown> | null;
  patch: Record<string, unknown>;
  action?: string;
  by?: string;
}): Promise<void> {
  const { before, patch } = opts;
  const entries: Entry[] = [];
  for (const [key, next] of Object.entries(patch)) {
    if (NOISE.has(key)) continue;
    const prev = before ? before[key] : null;
    if (asText(prev) === asText(next)) continue;
    entries.push({
      projectId: opts.projectId,
      entity: opts.entity,
      entityId: opts.entityId,
      label: opts.label,
      action: opts.action ?? "updated",
      field: key,
      oldValue: prev,
      newValue: next,
      by: opts.by,
    });
  }
  await logProjectChanges(entries);
}

/** A created row, summarised in one line: the fields that were actually filled. */
export async function logRowCreated(opts: {
  projectId: number;
  entity: string;
  entityId?: number | null;
  label?: string | null;
  row: Record<string, unknown>;
  by?: string;
}): Promise<void> {
  const parts: string[] = [];
  for (const [key, v] of Object.entries(opts.row)) {
    if (NOISE.has(key)) continue;
    const t = asText(v);
    if (t !== null) parts.push(`${key}=${t}`);
  }
  await logProjectChange({
    projectId: opts.projectId,
    entity: opts.entity,
    entityId: opts.entityId ?? null,
    label: opts.label,
    action: "created",
    newValue: parts.join(", ") || null,
    by: opts.by,
  });
}

const COLS = "id,entity,entity_id,label,action,field,old_value,new_value,created_by,created_at";

/** The trail for one project, newest first. */
export async function listProjectAudit(
  projectId: number,
  opts: { entity?: string; entityId?: number; limit?: number } = {},
): Promise<AuditRow[]> {
  let q = sb.from("project_audit").select(COLS).eq("project_id", projectId);
  if (opts.entity) q = q.eq("entity", opts.entity);
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

/** How many entries the trail holds — shown on the tab so it is visibly alive. */
export async function countProjectAudit(projectId: number): Promise<number> {
  const { count } = await sb
    .from("project_audit")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return count ?? 0;
}
