"use server";

// Portal-scoped "Recurring tasks" (automation) actions — managers/directors/HR
// manage their OWN standing recurring_task rules from the Tasks page. UNLIKE the
// Administrator's /ori-automations actions (owner-only, no internal auth), every
// action here re-verifies the caller with getPortalPerson() + the `recurringTasks`
// capability, because portal routes are NOT admin-gated (see cleaning/actions.ts
// for the same pattern).
//
// Scope: a person only ever sees/edits/deletes rules THEY created — matched on the
// automation_rules.created_by tag this portal stamps ("portal-dir:<Name>" /
// "portal-mgr:<Name>" / "portal-hr:<Name>", the same convention as
// portalDirectorCreateTask in src/app/portal/actions.ts).

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { getPortalPerson, companyScope, type PortalPerson } from "@/lib/portal-auth";
import type { RuleConfig } from "@/lib/ori/automations";
import {
  buildConfig, cleanAssigneeIds, rowToRule, PAUSED_FOREVER,
  type RecurringRuleRow, type RecurringTaskInput, type RecurringTaskRule, type Result,
} from "@/lib/recurring-task-rules";

// The shape and the checks live in src/lib/recurring-task-rules.ts, shared with
// the Administrator's door (src/app/task/recurring-actions.ts). Re-exported so the
// portal panel's imports do not move.
export type { RecurringTaskInput, RecurringTaskRule };

/** "portal-dir:<Name>" / "portal-mgr:<Name>" / "portal-hr:<Name>" — the exact tag
 *  portalDirectorCreateTask stamps, so a person's own recurring rules can be found
 *  by matching this same string. */
function createdByTag(me: PortalPerson): string {
  const tag = me.portalRole === "director" ? "portal-dir" : me.portalRole === "hr" ? "portal-hr" : "portal-mgr";
  return `${tag}:${me.name}`;
}

async function requireCap(): Promise<{ me: PortalPerson; tag: string } | null> {
  const me = await getPortalPerson();
  if (!me || !me.caps.recurringTasks) return null;
  return { me, tag: createdByTag(me) };
}

function revalidate() {
  revalidatePath("/portal/tasks");
  revalidatePath("/portal/board");
}

/** This person's own standing recurring-task rules (active only). Company-scoped
 *  roles never see rules outside their scope even if created_by somehow matched. */
export async function portalListRecurringTasks(): Promise<RecurringTaskRule[]> {
  const ctx = await requireCap();
  if (!ctx) return [];
  const { tag } = ctx;
  const scope = await companyScope(ctx.me); // null = unrestricted

  const { data } = await sb
    .from("automation_rules")
    .select("id,company_id,config,active,last_fired_at,created_by")
    .eq("kind", "recurring_task")
    .eq("active", true)
    .eq("created_by", tag)
    .order("created_at", { ascending: false });
  let rows = (data ?? []) as RecurringRuleRow[];
  if (scope != null) rows = rows.filter((r) => r.company_id != null && scope.includes(r.company_id));

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((id): id is number => id != null))];
  const companyNames = new Map<number, string>();
  if (companyIds.length) {
    const { data: comps } = await sb.from("companies").select("id,name").in("id", companyIds);
    for (const c of comps ?? []) companyNames.set(c.id as number, c.name as string);
  }

  return rows.map((r) => rowToRule(r, companyNames));
}

/** Create a new standing recurring-task rule for one of the caller's own companies. */
export async function portalCreateRecurringTask(input: RecurringTaskInput): Promise<Result> {
  const ctx = await requireCap();
  if (!ctx) return { ok: false, error: "You don't have permission to manage recurring tasks." };
  const { me, tag } = ctx;

  const companyId = Number(input.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Pick a company." };
  const scope = await companyScope(me);
  if (scope != null && !scope.includes(companyId)) return { ok: false, error: "You can only create recurring tasks for your companies." };

  const cfg = buildConfig(input);
  if ("error" in cfg) return { ok: false, error: cfg.error };

  const assigneeIds = cleanAssigneeIds(input.assigneePersonIds);
  if (assigneeIds.length) {
    const { data } = await sb.from("people").select("id").in("id", assigneeIds);
    if ((data ?? []).length !== assigneeIds.length) return { ok: false, error: "One of the assignees couldn't be found." };
    cfg.assigneePersonIds = assigneeIds;
  }

  const { error } = await sb.from("automation_rules").insert({
    kind: "recurring_task", task_id: null, company_id: companyId,
    config: cfg, active: true, done: false, created_by: tag, created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save the recurring task." };
  revalidate();
  return { ok: true };
}

/** Verify the rule exists, is a recurring_task, and was created by this person
 *  (their own tag) before allowing an edit/delete. */
async function ownRule(id: number, tag: string): Promise<{ companyId: number | null } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { data } = await sb.from("automation_rules").select("id,kind,created_by,company_id").eq("id", id).maybeSingle();
  if (!data || data.kind !== "recurring_task" || data.created_by !== tag) return null;
  return { companyId: data.company_id as number | null };
}

/** Update one of the caller's own recurring-task rules. */
export async function portalUpdateRecurringTask(id: number, input: RecurringTaskInput): Promise<Result> {
  const ctx = await requireCap();
  if (!ctx) return { ok: false, error: "You don't have permission to manage recurring tasks." };
  const { me, tag } = ctx;
  const owned = await ownRule(id, tag);
  if (!owned) return { ok: false, error: "That recurring task couldn't be found." };

  const companyId = Number(input.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Pick a company." };
  const scope = await companyScope(me);
  if (scope != null && !scope.includes(companyId)) return { ok: false, error: "You can only use your companies." };

  const cfg = buildConfig(input);
  if ("error" in cfg) return { ok: false, error: cfg.error };

  const assigneeIds = cleanAssigneeIds(input.assigneePersonIds);
  if (assigneeIds.length) {
    const { data } = await sb.from("people").select("id").in("id", assigneeIds);
    if ((data ?? []).length !== assigneeIds.length) return { ok: false, error: "One of the assignees couldn't be found." };
    cfg.assigneePersonIds = assigneeIds;
  }

  // Preserve the on/off switch across edits — buildConfig starts fresh and would
  // otherwise silently re-enable a paused rule.
  const { data: existing } = await sb.from("automation_rules").select("config").eq("id", id).maybeSingle();
  const prevPaused = (existing?.config as RuleConfig | null)?.pausedUntil;
  if (prevPaused) cfg.pausedUntil = prevPaused;

  const { error } = await sb.from("automation_rules").update({ company_id: companyId, config: cfg }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the recurring task." };
  revalidate();
  return { ok: true };
}

/** The on/off switch: pause (indefinitely) or resume one of the caller's own
 *  recurring-task rules without losing its settings. */
export async function portalSetRecurringTaskPaused(id: number, paused: boolean): Promise<Result> {
  const ctx = await requireCap();
  if (!ctx) return { ok: false, error: "You don't have permission to manage recurring tasks." };
  const owned = await ownRule(id, ctx.tag);
  if (!owned) return { ok: false, error: "That recurring task couldn't be found." };

  const { data } = await sb.from("automation_rules").select("config").eq("id", id).maybeSingle();
  const cfg = { ...((data?.config as RuleConfig | null) ?? {}) };
  if (paused) cfg.pausedUntil = PAUSED_FOREVER;
  else delete cfg.pausedUntil;

  const { error } = await sb.from("automation_rules").update({ config: cfg }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the recurring task." };
  revalidate();
  return { ok: true };
}

/** Soft-delete (active=false) one of the caller's own recurring-task rules —
 *  mirrors the Administrator's cancelAutomation (recoverable, never hard-deleted). */
export async function portalDeleteRecurringTask(id: number): Promise<Result> {
  const ctx = await requireCap();
  if (!ctx) return { ok: false, error: "You don't have permission to manage recurring tasks." };
  const owned = await ownRule(id, ctx.tag);
  if (!owned) return { ok: false, error: "That recurring task couldn't be found." };

  const { error } = await sb.from("automation_rules").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Could not remove the recurring task." };
  revalidate();
  return { ok: true };
}
