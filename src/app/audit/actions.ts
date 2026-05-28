"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";

type ActionResult = { ok: true } | { ok: false; error: string };

/* ----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function invalidate(taskCode?: string | null, companyId?: number | null) {
  revalidatePath("/audit");
  revalidatePath("/");
  if (taskCode) revalidatePath(`/task/${taskCode}`);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  updateTag("audit");
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
 * Soft delete / restore
 * ---------------------------------------------------------------------- */
export async function deleteAuditEntry(id: number): Promise<ActionResult> {
  const { data: row } = await sb
    .from("audit_log")
    .select("id,task_code,company_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Audit entry not found." };

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

/* ----------------------------------------------------------------------
 * Bulk delete
 * ---------------------------------------------------------------------- */
export async function bulkDeleteAuditEntries(
  ids: number[]
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  if (ids.length === 0) return { ok: true, deleted: 0 };

  const { error, count } = await sb
    .from("audit_log")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .is("deleted_at", null);

  if (error) return { ok: false, deleted: 0, error: error.message };

  invalidate();
  return { ok: true, deleted: count ?? 0 };
}
