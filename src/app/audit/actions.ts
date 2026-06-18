"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";

type ActionResult = { ok: true } | { ok: false; error: string };

/* ----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function invalidate(_taskCode?: string | null, companyId?: number | null) {
  // `/audit` and `/task/[code]` are not renderable routes (the audit page was
  // removed; /task/CODE only redirects), so revalidating those paths is a
  // no-op. Refresh the home surface + company profile, and tag-bust instead.
  revalidatePath("/");
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  updateTag("audit");
  updateTag("tasks");
}

/* ----------------------------------------------------------------------
 * Edit reason
 * ---------------------------------------------------------------------- */
export async function editAuditReason(id: number, newReason: string): Promise<ActionResult> {
  const trimmed = newReason.trim();
  // Empty string clears the reason (back to "NO REASON PROVIDED")
  const value = trimmed.length === 0 ? null : trimmed;

  const { data: row, error: readErr } = await sb
    .from("audit_log")
    .select("id,task_code,company_id,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Audit entry not found." };
  if (row.deleted_at) return { ok: false, error: "Cannot edit a deleted entry. Restore first." };

  const { error } = await sb.from("audit_log").update({ change_reason: value }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidate(row.task_code as string | null, row.company_id as number | null);
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Record a correction
 * ----------------------------------------------------------------------
 * The original entry stays untouched (it is factual history). We write a
 * new CORRECTION audit entry carrying the note, then link the two in the
 * `corrections` table so timelines can badge the old entry as "Corrected".
 * ---------------------------------------------------------------------- */
export async function recordCorrection(entryId: number, note: string): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: "Describe what is actually correct." };

  const { data: row, error: readErr } = await sb
    .from("audit_log")
    .select("id,task_id,task_code,company_id,field,deleted_at")
    .eq("id", entryId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Audit entry not found." };
  if (row.deleted_at) return { ok: false, error: "Cannot correct a deleted entry. Restore first." };

  const { data: created, error: insErr } = await sb
    .from("audit_log")
    .insert({
      task_id: row.task_id,
      task_code: row.task_code,
      company_id: row.company_id,
      entry_type: "CORRECTION",
      field: "Correction",
      old_value: row.field ? `re: ${row.field}` : null,
      new_value: trimmed,
      change_reason: trimmed,
      created_at: new Date().toISOString(),
      created_by: "web-ui",
    })
    .select("id")
    .single();
  if (insErr || !created) return { ok: false, error: insErr?.message ?? "Could not record the correction." };

  const { error: linkErr } = await sb.from("corrections").insert({
    audit_log_id: entryId,
    corrected_by_entry_id: created.id,
    status: "Resolved",
    created_at: new Date().toISOString(),
  });
  if (linkErr) return { ok: false, error: linkErr.message };

  invalidate(row.task_code as string | null, row.company_id as number | null);
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Soft delete / restore
 * ---------------------------------------------------------------------- */
export async function deleteAuditEntry(id: number): Promise<ActionResult> {
  const { data: row } = await sb
    .from("audit_log")
    .select("id,task_code,company_id,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: true }; // already gone
  if (row.deleted_at) return { ok: true }; // already hidden

  // Soft-delete: an audit log is governance history and must never be wiped.
  // Setting deleted_at hides the row from timelines/audit while keeping it
  // recoverable via restoreAuditEntry. Corrections links are left intact so a
  // restore brings the entry back fully formed.
  const { error } = await sb
    .from("audit_log")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidate(row.task_code as string | null, row.company_id as number | null);
  return { ok: true };
}

export async function restoreAuditEntry(id: number): Promise<ActionResult> {
  const { data: row } = await sb
    .from("audit_log")
    .select("id,task_code,company_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Audit entry not found." };

  const { error } = await sb.from("audit_log").update({ deleted_at: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidate(row.task_code as string | null, row.company_id as number | null);
  return { ok: true };
}
