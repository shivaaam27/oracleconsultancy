"use server";

import { guardOwner } from "@/lib/auth/viewer";
// The Administrator's door for recurring-task rules — EVERY standing
// `recurring_task` rule, whoever set it up (the owner's own, a director's, a
// manager's), with add / edit / switch off / remove. The portal's twin
// (src/app/portal/(app)/tasks/automations-actions.ts) is scoped to what the
// person created; this one is not, because the administrator is the one place
// that can see the whole list. Both read and write the same `automation_rules`
// rows through the same checks in src/lib/tasks/recurring-task-rules.ts.
//
// Auth: this is an admin route, so the edge gate in src/proxy.ts is the check —
// the same footing as every other action in src/app/task/actions.ts.

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import type { RuleConfig } from "@/lib/ori/automations";
import {
  buildConfig, cleanAssigneeIds, rowToRule, PAUSED_FOREVER,
  type RecurringRuleRow, type RecurringTaskInput, type RecurringTaskRule, type Result,
} from "@/lib/tasks/recurring-task-rules";

function revalidate() {
  revalidatePath("/task/recurring");
  revalidatePath("/ori-automations");
  revalidatePath("/portal/tasks");
}

/** Every live recurring-task rule, newest first. */
export async function listRecurringTasks(): Promise<RecurringTaskRule[]> {
  await guardOwner();
  const { data } = await sb
    .from("automation_rules")
    .select("id,company_id,config,active,last_fired_at,created_by")
    .eq("kind", "recurring_task")
    .eq("active", true)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as RecurringRuleRow[];

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((id): id is number => id != null))];
  const companyNames = new Map<number, string>();
  if (companyIds.length) {
    const { data: comps } = await sb.from("companies").select("id,name").in("id", companyIds);
    for (const c of comps ?? []) companyNames.set(c.id as number, c.name as string);
  }
  return rows.map((r) => rowToRule(r, companyNames));
}

async function checkedConfig(input: RecurringTaskInput): Promise<{ companyId: number; cfg: RuleConfig } | { error: string }> {
  const companyId = Number(input.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) return { error: "Pick a company." };
  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return { error: "That company couldn't be found." };

  const cfg = buildConfig(input);
  if ("error" in cfg) return cfg;

  const assigneeIds = cleanAssigneeIds(input.assigneePersonIds);
  if (assigneeIds.length) {
    const { data } = await sb.from("people").select("id").in("id", assigneeIds);
    if ((data ?? []).length !== assigneeIds.length) return { error: "One of the assignees couldn't be found." };
    cfg.assigneePersonIds = assigneeIds;
  }
  return { companyId, cfg };
}

async function findRule(id: number): Promise<{ config: RuleConfig | null } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { data } = await sb.from("automation_rules").select("id,kind,config").eq("id", id).maybeSingle();
  if (!data || data.kind !== "recurring_task") return null;
  return { config: (data.config as RuleConfig | null) ?? null };
}

/** Save a standing rule and create NOTHING today — the "it is for Friday, so
 *  leave it until Friday" path. Returns the new rule's id. Used by the create
 *  forms when the chosen days are all in the future; the rule itself is the
 *  same one `createRecurringTask` writes. */
export async function saveRuleOnly(input: RecurringTaskInput, createdBy = "web-ui"): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await guardOwner();
  const checked = await checkedConfig(input);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { data, error } = await sb.from("automation_rules").insert({
    kind: "recurring_task", task_id: null, company_id: checked.companyId,
    config: checked.cfg, active: true, done: false, created_by: createdBy, created_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Could not save the recurring task." };
  revalidate();
  return { ok: true, id: data.id as number };
}

export async function createRecurringTask(input: RecurringTaskInput): Promise<Result> {
  await guardOwner();
  const checked = await checkedConfig(input);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { error } = await sb.from("automation_rules").insert({
    kind: "recurring_task", task_id: null, company_id: checked.companyId,
    config: checked.cfg, active: true, done: false, created_by: "web-ui", created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save the recurring task." };
  revalidate();
  return { ok: true };
}

export async function updateRecurringTask(id: number, input: RecurringTaskInput): Promise<Result> {
  await guardOwner();
  const existing = await findRule(id);
  if (!existing) return { ok: false, error: "That recurring task couldn't be found." };
  const checked = await checkedConfig(input);
  if ("error" in checked) return { ok: false, error: checked.error };
  // Preserve the on/off switch across edits — buildConfig starts fresh and would
  // otherwise silently re-enable a paused rule.
  const prevPaused = existing.config?.pausedUntil;
  if (prevPaused) checked.cfg.pausedUntil = prevPaused;
  const { error } = await sb.from("automation_rules").update({ company_id: checked.companyId, config: checked.cfg }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the recurring task." };
  revalidate();
  return { ok: true };
}

/** The on/off switch: settings kept, nothing created until switched back on. */
export async function setRecurringTaskPaused(id: number, paused: boolean): Promise<Result> {
  await guardOwner();
  const existing = await findRule(id);
  if (!existing) return { ok: false, error: "That recurring task couldn't be found." };
  const cfg = { ...(existing.config ?? {}) };
  if (paused) cfg.pausedUntil = PAUSED_FOREVER;
  else delete cfg.pausedUntil;
  const { error } = await sb.from("automation_rules").update({ config: cfg }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the recurring task." };
  revalidate();
  return { ok: true };
}

/** The rule a task came from, for its record. Null when it does not repeat, or
 *  when its rule has been stopped. */
export async function taskRecurrence(taskId: number): Promise<RecurringTaskRule | null> {
  await guardOwner();
  const { data: t } = await sb.from("tasks").select("recurring_rule_id").eq("id", taskId).maybeSingle();
  const ruleId = t?.recurring_rule_id as number | null | undefined;
  if (!ruleId) return null;
  const { data } = await sb
    .from("automation_rules")
    .select("id,company_id,config,active,last_fired_at,created_by")
    .eq("id", ruleId).eq("kind", "recurring_task").eq("active", true).maybeSingle();
  if (!data) return null;
  const r = data as RecurringRuleRow;
  const companyNames = new Map<number, string>();
  if (r.company_id != null) {
    const { data: c } = await sb.from("companies").select("name").eq("id", r.company_id).maybeSingle();
    if (c) companyNames.set(r.company_id, c.name as string);
  }
  return rowToRule(r, companyNames);
}

/** Make a task repeat, or change how it repeats — from its own record. Edits
 *  the rule it already points at, else creates one and links the task. */
export async function setTaskRecurrence(taskId: number, input: RecurringTaskInput): Promise<Result> {
  // Said, not thrown: the task page shows this as a toast.
  try { await guardOwner(); } catch { return { ok: false, error: "Only the administrator can change how a task repeats." }; }
  const { data: t } = await sb.from("tasks").select("id,recurring_rule_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const ruleId = t.recurring_rule_id as number | null;
  if (ruleId && (await findRule(ruleId))) {
    const res = await updateRecurringTask(ruleId, input);
    if (res.ok) revalidatePath("/task", "layout");
    return res;
  }
  const checked = await checkedConfig(input);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { data: rule, error } = await sb.from("automation_rules").insert({
    kind: "recurring_task", task_id: null, company_id: checked.companyId,
    config: checked.cfg, active: true, done: false, created_by: "web-ui", created_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !rule) return { ok: false, error: "Could not save the recurring task." };
  await sb.from("tasks").update({ recurring_rule_id: rule.id as number }).eq("id", taskId);
  revalidate(); revalidatePath("/task", "layout");
  return { ok: true };
}

/** Stop a task repeating: its rule is switched off for good (soft-deleted) and
 *  every occurrence is unlinked, so none of them reads as recurring any more. */
export async function stopTaskRecurrence(taskId: number): Promise<Result> {
  // Said, not thrown: the task page shows this as a toast.
  try { await guardOwner(); } catch { return { ok: false, error: "Only the administrator can change how a task repeats." }; }
  const { data: t } = await sb.from("tasks").select("id,recurring_rule_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const ruleId = t.recurring_rule_id as number | null;
  if (!ruleId) return { ok: false, error: "This task does not repeat." };
  const res = await deleteRecurringTask(ruleId);
  if (!res.ok) return res;
  await sb.from("tasks").update({ recurring_rule_id: null }).eq("recurring_rule_id", ruleId);
  revalidatePath("/task", "layout");
  return { ok: true };
}

/** Soft-delete (active=false) — the same recoverable cancel ORI Automation does. */
export async function deleteRecurringTask(id: number): Promise<Result> {
  await guardOwner();
  const existing = await findRule(id);
  if (!existing) return { ok: false, error: "That recurring task couldn't be found." };
  const { error } = await sb.from("automation_rules").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Could not remove the recurring task." };
  revalidate();
  return { ok: true };
}
