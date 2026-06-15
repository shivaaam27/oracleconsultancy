// Supabase-based helpers shared across server actions.
// Replaces the per-file Drizzle helpers (getOrCreatePerson, getOrCreateDept,
// logChange, insertTaskWithUniqueCode) so every write path can be migrated
// off Drizzle without duplicating logic.

import { sb } from "@/db/supabase";
import { indexEmbedding } from "@/lib/embeddings";

export function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getOrCreatePersonSb(
  name: string,
  companyId: number | null
): Promise<number> {
  // Case-insensitive exact match so "Jitesh" / "jitesh" never duplicate.
  const { data: existing, error: e1 } = await sb
    .from("people")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (existing) return existing.id as number;

  const { error: insErr } = await sb
    .from("people")
    .upsert(
      { name, company_id: companyId, active: true },
      { onConflict: "name", ignoreDuplicates: true }
    );
  if (insErr) throw new Error(insErr.message);

  const { data: after, error: e2 } = await sb
    .from("people")
    .select("id")
    .eq("name", name)
    .single();
  if (e2) throw new Error(e2.message);
  return after.id as number;
}

export async function getOrCreateDeptSb(name: string | null): Promise<number | null> {
  if (!name) return null;
  const { data: existing, error: e1 } = await sb
    .from("departments")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (existing) return existing.id as number;

  const { error: insErr } = await sb
    .from("departments")
    .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
  if (insErr) throw new Error(insErr.message);

  const { data: after, error: e2 } = await sb
    .from("departments")
    .select("id")
    .eq("name", name)
    .single();
  if (e2) throw new Error(e2.message);
  return after.id as number;
}

export async function deptNameSb(id: number | null): Promise<string | null> {
  if (id == null) return null;
  const { data, error } = await sb
    .from("departments")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.name as string | null) ?? null;
}

export async function logChangeSb(
  taskId: number,
  taskCode: string,
  companyId: number,
  field: string,
  oldVal: unknown,
  newVal: unknown,
  reason: string | null,
  createdBy: string = "web-ui"
): Promise<void> {
  const toS = (v: unknown): string | null =>
    v == null ? null : v instanceof Date ? fmtLocalDate(v) : String(v);
  const oldS = toS(oldVal);
  const newS = toS(newVal);
  if (oldS === newS) return;
  const { error } = await sb.from("audit_log").insert({
    task_id: taskId,
    task_code: taskCode,
    company_id: companyId,
    entry_type: "CHANGE",
    field,
    old_value: oldS,
    new_value: newS,
    change_reason: reason,
    created_at: new Date().toISOString(),
    created_by: createdBy,
  });
  if (error) throw new Error(error.message);
}

export type TaskInsertValues = {
  departmentId?: number | null;
  actionItem: string;
  ownerId?: number | null;
  status?: string;
  priority?: string;
  risk?: string | null;
  escalation?: string | null;
  category?: string | null;
  deadline?: Date | string | null;
  meetingDate?: Date | string | null;
  comments?: string | null;
  latestUpdate?: string | null;
  createdDate?: Date;
  lastUpdatedAt?: Date;
  archived?: boolean;
  createdByPersonId?: number | null;
};

function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}

// Read-max-then-insert with retry on unique-violation.
export async function insertTaskWithUniqueCodeSb(
  companyId: number,
  codePrefix: string,
  values: TaskInsertValues
): Promise<{ id: number; code: string }> {
  // Prefer the company's two-letter code_prefix (DS-001); the passed codePrefix
  // (usually the legacy company code) is only a fallback. This keeps every
  // creation path on the new scheme without each caller having to know it.
  const { data: comp } = await sb.from("companies").select("code_prefix").eq("id", companyId).maybeSingle();
  const prefix = (comp?.code_prefix as string | null) || codePrefix;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing, error: e1 } = await sb
      .from("tasks")
      .select("code")
      .eq("company_id", companyId);
    if (e1) throw new Error(e1.message);

    let maxNum = 0;
    for (const row of existing ?? []) {
      // Trailing number works for both legacy (CO01-008) and new (DS-001) codes.
      const m = (row.code as string).match(/(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const newCode = `${prefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;

    const insertPayload = {
      code: newCode,
      company_id: companyId,
      department_id: values.departmentId ?? null,
      action_item: values.actionItem,
      owner_id: values.ownerId ?? null,
      status: values.status ?? "Not Started",
      priority: values.priority ?? "Low",
      risk: values.risk ?? null,
      escalation: values.escalation ?? "No",
      category: values.category ?? null,
      deadline: toIso(values.deadline),
      meeting_date: toIso(values.meetingDate),
      comments: values.comments ?? null,
      latest_update: values.latestUpdate ?? null,
      created_date: toIso(values.createdDate),
      last_updated_at: toIso(values.lastUpdatedAt),
      archived: values.archived ?? false,
      created_by_person_id: values.createdByPersonId ?? null,
    };

    const { data, error } = await sb
      .from("tasks")
      .insert(insertPayload)
      .select("id,code")
      .single();
    if (!error && data) {
      // Best-effort semantic index (no-op unless semantic search is enabled).
      void indexEmbedding("task", data.id as number, values.actionItem);
      return { id: data.id as number, code: data.code as string };
    }
    const msg = error?.message || "";
    if (!/duplicate key|unique/i.test(msg)) throw new Error(msg);
    // retry with next number
  }
  throw new Error("Could not allocate unique task code after retries");
}
