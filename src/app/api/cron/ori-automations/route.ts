// /api/cron/ori-automations — fires ORI's standing automation rules (the ones the
// agent creates from a conversation: remind before deadline, nudge until update,
// escalate if no update, create event after deadline). Distinct from
// /api/cron/automations (recurring-obligation tasks). Owner autonomy = "trust
// standing rules once set up": the owner approved each rule at creation, so it
// fires here without re-confirming. DORMANT until scheduled — invoke with the cron
// secret. Reminders/nudges go via in-app notification + web push (both wired);
// external email/WhatsApp send is layered later behind the send guardrails.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { sb } from "@/db/supabase";
import { createNotification, personRecipient } from "@/lib/notifications";
import { createCalendarEvent } from "@/lib/calendar";
import { reindexEntity } from "@/lib/index-hooks";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { canAutoSend, type SendChannel } from "@/lib/guardrails";
import { evaluateRule, smartFiredKey, type AutomationRuleRow, type RuleConfig, type RuleKind } from "@/lib/ori/automations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function d(v: unknown): Date | null { return v ? new Date(v as string) : null; }

async function assigneeIds(taskId: number): Promise<number[]> {
  const [{ data: links }, { data: task }] = await Promise.all([
    sb.from("task_assignees").select("person_id").eq("task_id", taskId),
    sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle(),
  ]);
  const ids = new Set<number>(((links ?? []) as { person_id: number }[]).map((l) => l.person_id));
  const owner = (task as { owner_id?: number | null })?.owner_id;
  if (owner) ids.add(owner);
  return [...ids];
}

async function lastUpdateAt(taskId: number): Promise<Date | null> {
  const { data } = await sb.from("task_updates").select("created_at").eq("task_id", taskId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return d((data as { created_at?: string })?.created_at);
}

type Contact = { name: string; email: string | null; whatsapp: string | null; managerId: number | null };
async function personContact(id: number): Promise<Contact | null> {
  const { data } = await sb.from("people").select("name,email,whatsapp,phone,manager_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    name: (r.name as string) ?? "",
    email: (r.email as string | null) || null,
    whatsapp: ((r.whatsapp as string | null) || (r.phone as string | null)) || null,
    managerId: (r.manager_id as number | null) ?? null,
  };
}

/**
 * Phase 6b — OPTIONAL external send, guardrail-gated. A reminder/nudge/escalation
 * already lands in-app + push; when the rule carries an email/WhatsApp `channel`
 * AND the owner has switched auto-send ON for it (canAutoSend — FAILS CLOSED), we
 * also send it out that way. If the channel is off (or "push"/unset), this no-ops
 * and the caller's behaviour is exactly as before. Best-effort: never throws.
 */
async function externalNotify(config: RuleConfig, personIds: number[], subject: string, body: string): Promise<number> {
  const raw = (config.channel ?? "").toLowerCase();
  if (raw !== "email" && raw !== "whatsapp" && raw !== "sms") return 0; // in-app only
  const channel = raw as SendChannel;
  if (!(await canAutoSend(channel))) return 0; // guardrail off → fail closed, no send
  let sent = 0;
  for (const pid of personIds) {
    try {
      const c = await personContact(pid);
      if (!c) continue;
      if (channel === "email") {
        if (!c.email) continue;
        const { sendEmail } = await import("@/lib/email/send");
        const res = await sendEmail({ to: c.email, subject, text: `${body}`, fromName: "ORI" });
        if (res.ok) sent++;
      } else {
        // whatsapp / sms both go through the WhatsApp helper's free-form text path.
        if (!c.whatsapp) continue;
        const { sendWhatsApp } = await import("@/lib/whatsapp");
        const res = await sendWhatsApp({ to: c.whatsapp, text: `${subject}\n\n${body}` });
        if (res.ok) sent++;
      }
    } catch (e) {
      await reportError(e, { route: "cron.ori-automations", step: "externalNotify", channel, personId: pid });
    }
  }
  return sent;
}

/** Is a person on APPROVED leave that covers `day` (a YYYY-MM-DD string)? */
async function onApprovedLeave(personId: number, day: string): Promise<boolean> {
  const { data } = await sb
    .from("leave_requests")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "Approved")
    .lte("start_date", `${day}T23:59:59Z`)
    .gte("end_date", `${day}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * auto_reassign_on_leave firing. If the task's current owner is on approved leave
 * today, hand the task to the fallback (or the owner's manager) for the window and
 * remember whom we displaced in the rule config; once they're back off leave, hand
 * it straight back. Idempotent — safe to run every day. The daily cadence is set by
 * the pure evaluator; this does the DB work.
 */
async function coverTaskOnLeave(taskId: number, code: string, companyId: number | null, config: RuleConfig, nowIso: string): Promise<void> {
  const cfg = config as RuleConfig & { _coveredFor?: number; _coveredBy?: number };
  const day = nowIso.slice(0, 10);
  const { data: task } = await sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle();
  const currentOwner = (task as { owner_id?: number | null })?.owner_id ?? null;

  // Already covering? If the displaced person is back off leave, revert.
  if (cfg._coveredFor) {
    const stillOff = await onApprovedLeave(cfg._coveredFor, day);
    if (!stillOff) {
      await sb.from("tasks").update({ owner_id: cfg._coveredFor, last_updated_at: nowIso }).eq("id", taskId);
      await sb.from("task_assignees").delete().eq("task_id", taskId);
      await sb.from("task_assignees").upsert({ task_id: taskId, person_id: cfg._coveredFor }, { ignoreDuplicates: true });
      void reindexEntity("task", taskId);
      const orig = await personContact(cfg._coveredFor);
      await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI handed ${code} back`, body: `${orig?.name ?? "The assignee"} is back from leave — ${code} returned to them.`, actor: "ORI" });
      // Clear the cover markers on the rule config.
      const next = { ...config }; delete (next as Record<string, unknown>)._coveredFor; delete (next as Record<string, unknown>)._coveredBy;
      await sb.from("automation_rules").update({ config: next }).eq("kind", "auto_reassign_on_leave").eq("task_id", taskId);
    }
    return;
  }

  // Not covering yet. If the current owner is on leave today, hand the task over.
  if (!currentOwner) return;
  if (!(await onApprovedLeave(currentOwner, day))) return;

  let coverId = typeof config.fallbackPersonId === "number" ? config.fallbackPersonId : null;
  if (!coverId) {
    const owner = await personContact(currentOwner);
    coverId = owner?.managerId ?? null;
  }
  if (!coverId || coverId === currentOwner) return; // nobody to cover → leave as-is
  // Don't bounce to someone who's also on leave.
  if (await onApprovedLeave(coverId, day)) return;

  await sb.from("tasks").update({ owner_id: coverId, last_updated_at: nowIso }).eq("id", taskId);
  await sb.from("task_assignees").delete().eq("task_id", taskId);
  await sb.from("task_assignees").upsert({ task_id: taskId, person_id: coverId }, { ignoreDuplicates: true });
  void reindexEntity("task", taskId);
  const cover = await personContact(coverId);
  const orig = await personContact(currentOwner);
  await createNotification({ recipient: personRecipient(coverId), kind: "assigned", taskId, taskCode: code, title: `Covering ${code}`, body: `${orig?.name ?? "A colleague"} is on leave — ORI has handed you ${code} until they're back.`, actor: "ORI" });
  await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI covered ${code}`, body: `${orig?.name ?? "The assignee"} is on leave — ${code} handed to ${cover?.name ?? "cover"}.`, actor: "ORI" });
  const next = { ...config, _coveredFor: currentOwner, _coveredBy: coverId };
  await sb.from("automation_rules").update({ config: next }).eq("kind", "auto_reassign_on_leave").eq("task_id", taskId);
}

type SmartTarget = { id: number; code: string; company_id: number | null; deadline: string | null; status: string; created_date: string | null };

/** Resolve the task a smart_reminder acts on: an explicit scope.taskId, else the
 *  scoped person's / company's most-overdue OPEN task (best effort; null if none). */
async function resolveSmartTarget(cfg: RuleConfig): Promise<SmartTarget | null> {
  const sel = "id,code,company_id,deadline,status,created_date";
  const scope = cfg.scope ?? {};
  if (typeof scope.taskId === "number") {
    const { data } = await sb.from("tasks").select(sel).eq("id", scope.taskId).maybeSingle();
    return (data as SmartTarget) ?? null;
  }
  const open = ["Completed", "Closed"];
  if (typeof scope.personId === "number") {
    // Their most-overdue open task (owned or assigned). Owner is the simplest signal.
    const { data } = await sb.from("tasks").select(sel).eq("owner_id", scope.personId).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    if (data) return data as SmartTarget;
    const { data: link } = await sb.from("task_assignees").select("task_id").eq("person_id", scope.personId).limit(50);
    const ids = ((link ?? []) as { task_id: number }[]).map((l) => l.task_id);
    if (!ids.length) return null;
    const { data: t } = await sb.from("tasks").select(sel).in("id", ids).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    return (t as SmartTarget) ?? null;
  }
  if (typeof scope.companyId === "number") {
    const { data } = await sb.from("tasks").select(sel).eq("company_id", scope.companyId).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    return (data as SmartTarget) ?? null;
  }
  return null;
}

/** Director person ids (portal_role="director") — an audience for smart reminders. */
async function directorIds(): Promise<number[]> {
  const { data } = await sb.from("people").select("id").eq("active", true).eq("portal_role", "director");
  return ((data ?? []) as { id: number }[]).map((r) => r.id);
}

/**
 * Perform a fired smart_reminder in SAFE order:
 *   1) AUDIENCE (always allowed, internal) — owner / directors / the scoped person /
 *      extra people, via createNotification (honours quiet hours + digest + push).
 *   2) AUTO-ACT (ONLY if actions.autoAct === true, the opt-in; default OFF):
 *        · postUpdate → an update authored created_by:"ori" (same shape as post_as_ori);
 *        · setStatus  → change the task's status;
 *        · sendChannel → external email/WhatsApp ONLY if canAutoSend() (fail-closed).
 *   Never auto-deletes. Each effect is wrapped so one failure never aborts the rest.
 */
async function fireSmartReminder(cfg: RuleConfig, target: SmartTarget | null, nowIso: string): Promise<void> {
  const audience = cfg.audience ?? {};
  const actions = cfg.actions ?? {};
  const code = target?.code ?? null;
  const label = "ORI reminder";
  const body = actions.updateText?.trim()
    || (code ? `A reminder about ${code} — it's due for an update.` : "A reminder from ORI — this is due for an update.");

  // 1) AUDIENCE — internal notifications (always allowed). Best-effort each.
  const recipients = new Set<string>();
  if (audience.notifyOwner) recipients.add("admin");
  if (audience.warnPerson && typeof cfg.scope?.personId === "number") recipients.add(personRecipient(cfg.scope.personId));
  for (const id of (audience.notifyPersonIds ?? [])) if (typeof id === "number") recipients.add(personRecipient(id));
  if (audience.notifyDirectors) for (const id of await directorIds()) recipients.add(personRecipient(id));
  for (const r of recipients) {
    try {
      await createNotification({ recipient: r, kind: "assigned", taskId: target?.id ?? null, taskCode: code, title: code ? `${label}: ${code}` : label, body, actor: "ORI" });
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.audience", recipient: r }); }
  }

  // 2) AUTO-ACT — opt-in ONLY. Default off = nothing below runs.
  if (actions.autoAct !== true || !target) return;

  if (actions.postUpdate) {
    try {
      const text = actions.updateText?.trim() || "ORI: this task is now due — please post an update.";
      await sb.from("task_updates").insert({ task_id: target.id, body: text, created_at: nowIso, created_by: "ori" });
      await sb.from("tasks").update({ latest_update: text, last_updated_at: nowIso }).eq("id", target.id);
      void reindexEntity("task", target.id);
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.postUpdate", taskId: target.id }); }
  }

  if (actions.setStatus) {
    try {
      const status = actions.setStatus;
      const patch: Record<string, unknown> = { status, last_updated_at: nowIso };
      if (status === "Completed" || status === "Closed") patch.closed_date = nowIso;
      await sb.from("tasks").update(patch).eq("id", target.id);
      void reindexEntity("task", target.id);
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.setStatus", taskId: target.id }); }
  }

  if (actions.sendChannel === "email" || actions.sendChannel === "whatsapp") {
    try {
      // Send to the scoped person (best target for a "you're due" nudge).
      const pid = cfg.scope?.personId;
      if (typeof pid === "number") {
        if (await canAutoSend(actions.sendChannel as SendChannel)) {
          await externalNotify({ channel: actions.sendChannel }, [pid], code ? `${label}: ${code}` : label, body);
        } else {
          await recordEvent("cron.ori-automations", "ok", { smart: "guardrail off", channel: actions.sendChannel });
        }
      }
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.send", channel: actions.sendChannel }); }
  }
}

/**
 * Sweep every active ORI automation rule once and perform the actions for the ones
 * that FIRE this tick. Shared by the daily Vercel cron (GET below) AND the secured
 * /api/cron/tick endpoint an external scheduler can hit more often — the same code
 * fires each rule at most once per day-slot (lastFiredKey/last_fired_at dedupe), so
 * calling it 100×/day is safe. Fail-open: one rule's failure never aborts the rest.
 */
export async function runDueRules(now = new Date()): Promise<{ evaluated: number; fired: number; retired: number }> {
  const nowIso = now.toISOString();
  let fired = 0, retired = 0, evaluated = 0;

  {
    const { data: rules } = await sb
      .from("automation_rules")
      .select("id,task_id,company_id,kind,config,active,done,created_at,last_fired_at")
      .eq("active", true).eq("done", false)
      .limit(500);

    for (const raw of (rules ?? []) as Record<string, unknown>[]) {
      const taskId = raw.task_id as number | null;

      // recurring_task isn't bound to a live task — evaluate it against a synthetic
      // always-open task so only its cadence gates firing, and create a fresh task
      // when it's due.
      if (raw.kind === "recurring_task") {
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "recurring_task", config: (raw.config as RuleConfig) ?? {},
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, { deadline: null, status: "In Progress", createdDate: null }, null, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.fire) {
          patch.last_fired_at = nowIso;
          fired++;
          try {
            const cfg = rule.config;
            const companyId = cfg.companyId as number | undefined;
            const title = (cfg.title as string | undefined)?.trim();
            if (companyId && title) {
              const { data: comp } = await sb.from("companies").select("code").eq("id", companyId).maybeSingle();
              const priority = ["Critical", "High", "Medium", "Low"].includes(String(cfg.priority)) ? String(cfg.priority) : "Medium";
              const created = new Date();
              const task = await insertTaskWithUniqueCodeSb(companyId, (comp?.code as string) ?? "", {
                actionItem: title, status: "Not Started", priority, escalation: "No",
                deadline: null, createdDate: created, lastUpdatedAt: created, archived: false, category: "Admin",
              });
              const aIds = Array.isArray(cfg.assigneePersonIds) ? (cfg.assigneePersonIds as number[]) : [];
              for (const pid of aIds) await sb.from("task_assignees").upsert({ task_id: task.id, person_id: pid }, { ignoreDuplicates: true });
              await sb.from("audit_log").insert({ task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task", old_value: null, new_value: title, change_reason: "Recurring task (ORI automation)", created_at: nowIso, created_by: "ai-command" });
              void reindexEntity("task", task.id);
            }
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "recurring_task" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      // scheduled_macro — like recurring_task, cadence-gated and NOT task-bound. When
      // due we SURFACE the saved macro's steps as a confirm-and-run prompt for the
      // owner; we NEVER auto-execute the steps (that would be Tier 3 send/spend/delete).
      if (raw.kind === "scheduled_macro") {
        const cfg = (raw.config as RuleConfig) ?? {};
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "scheduled_macro", config: cfg,
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, { deadline: null, status: "In Progress", createdDate: null }, null, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.fire) {
          patch.last_fired_at = nowIso;
          fired++;
          try {
            const macroName = (cfg.macroName ?? "").trim();
            const { findMacro } = await import("@/lib/ai-memory");
            const macro = macroName ? await findMacro("admin", macroName) : null;
            const steps = (macro?.steps ?? "").trim();
            const label = macro?.name || macroName || "Macro";
            await createNotification({
              recipient: "admin",
              kind: "assigned",
              title: `Scheduled macro ready: ${label}`,
              body: steps
                ? `It's time to run “${label}”. Steps: ${steps.slice(0, 300)} — open ORI and say “run macro ${label}” to confirm and execute.`
                : `“${macroName}” is scheduled to run now, but its steps couldn't be found. Save it again with “save macro ${macroName}: <steps>”.`,
              actor: "ORI",
            });
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "scheduled_macro" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      // smart_reminder — a conditional, time-of-day rule with an OPT-IN auto-act.
      // It scopes to a person / company / task (not a live task row), so it's swept
      // like recurring_task: the pure evaluator gates WHEN + IF, and this branch
      // performs the SAFE-ORDERED effects (audience first, opt-in auto-act second).
      if (raw.kind === "smart_reminder") {
        const cfg = (raw.config as RuleConfig) ?? {};
        const scopeTaskId = cfg.scope?.taskId ?? null;
        // Resolve the target task the rule acts on: an explicit scope.taskId, else
        // the scoped person/company's most-overdue open task (best effort).
        const target = await resolveSmartTarget(cfg);
        // Evaluate against the target task if we have one (so overdue/no-update read
        // real data), else a synthetic always-open task (byHour/always still work).
        const evalTask = target
          ? { deadline: d(target.deadline), status: target.status, createdDate: d(target.created_date) }
          : { deadline: null, status: "In Progress", createdDate: null };
        const lastUpd = target ? await lastUpdateAt(target.id) : null;
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "smart_reminder", config: cfg,
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, evalTask, lastUpd, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.fire) {
          fired++;
          patch.last_fired_at = nowIso;
          patch.config = { ...cfg, lastFiredKey: smartFiredKey(rule.id, now) };
          try {
            await fireSmartReminder(cfg, target, nowIso);
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "smart_reminder" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      if (!taskId) continue;
      const { data: task } = await sb.from("tasks").select("id,code,company_id,deadline,status,created_date,archived").eq("id", taskId).maybeSingle();
      if (!task || (task as { archived?: boolean }).archived) {
        await sb.from("automation_rules").update({ active: false, last_run_at: nowIso }).eq("id", raw.id as number);
        retired++; continue;
      }
      const t = task as Record<string, unknown>;
      const rule: AutomationRuleRow = {
        id: raw.id as number, kind: raw.kind as RuleKind, config: (raw.config as Record<string, unknown>) ?? {},
        active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
      };
      const evalRes = evaluateRule(
        rule,
        { deadline: d(t.deadline), status: t.status as string, createdDate: d(t.created_date) },
        await lastUpdateAt(taskId),
        now,
      );
      evaluated++;

      const patch: Record<string, unknown> = { last_run_at: nowIso };
      if (evalRes.deactivate) { patch.active = false; retired++; }
      if (evalRes.markDone) patch.done = true;

      if (evalRes.fire) {
        patch.last_fired_at = nowIso;
        fired++;
        const code = t.code as string;
        try {
          if (rule.kind === "reminder_before_deadline" || rule.kind === "nudge_until_update") {
            const label = rule.kind === "reminder_before_deadline" ? "Deadline reminder" : "Please post an update";
            const body = rule.kind === "reminder_before_deadline" ? "This task is due soon — please make sure it's on track." : "This task needs a progress update.";
            const targets = await assigneeIds(taskId);
            for (const pid of targets) {
              await createNotification({ recipient: personRecipient(pid), kind: "assigned", taskId, taskCode: code, title: `${label}: ${code}`, body, actor: "ORI" });
            }
            // Phase 6b: also send externally when the rule opted into email/WhatsApp
            // AND the owner has that channel's auto-send ON (guardrail; fails closed).
            await externalNotify(rule.config, targets, `${label}: ${code}`, body);
          } else if (rule.kind === "escalate_if_no_update") {
            await sb.from("tasks").update({ status: "Escalated", escalation: "Yes", last_updated_at: nowIso }).eq("id", taskId);
            void reindexEntity("task", taskId);
            const toId = rule.config.escalateToPersonId;
            const escBody = "No update was posted in time, so ORI escalated this to you.";
            if (typeof toId === "number") {
              await createNotification({ recipient: personRecipient(toId), kind: "assigned", taskId, taskCode: code, title: `Escalated: ${code}`, body: escBody, actor: "ORI" });
              await externalNotify(rule.config, [toId], `Escalated: ${code}`, escBody);
            }
            await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI escalated ${code}`, body: "No update in the set window.", actor: "ORI" });
          } else if (rule.kind === "auto_close_stale") {
            // Close the stale task. Reversible: we log it to the audit trail with the
            // prior status so the owner can reopen; never a hard delete.
            const prevStatus = t.status as string;
            await sb.from("tasks").update({ status: "Closed", closed_date: nowIso, last_updated_at: nowIso }).eq("id", taskId);
            await sb.from("task_updates").insert({ task_id: taskId, body: `Auto-closed by ORI — no update in ${rule.config.staleDays ?? 7} day(s). Reopen if still live.`, created_at: nowIso, created_by: "ai-command" });
            await sb.from("audit_log").insert({ task_id: taskId, task_code: code, company_id: (t.company_id as number) ?? null, entry_type: "UPDATE", field: "Status", old_value: prevStatus, new_value: "Closed", change_reason: "ORI auto-close (stale)", created_at: nowIso, created_by: "ai-command" });
            void reindexEntity("task", taskId);
            await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI closed ${code}`, body: `Auto-closed — untouched for ${rule.config.staleDays ?? 7} day(s).`, actor: "ORI" });
          } else if (rule.kind === "auto_reassign_on_leave") {
            await coverTaskOnLeave(taskId, code, t.company_id as number | null, rule.config, nowIso);
          } else if (rule.kind === "create_event_after_deadline") {
            const cfg = rule.config;
            const deadline = d(t.deadline) ?? now;
            const dateStr = deadline.toISOString().slice(0, 10);
            const allDay = !cfg.time;
            const startAt = new Date(`${dateStr}T${allDay ? "09:00" : cfg.time}:00+03:00`);
            await createCalendarEvent({ title: cfg.title || `Follow-up: ${code}`, companyId: (t.company_id as number) ?? undefined, location: cfg.location, startAt, endAt: new Date(startAt.getTime() + 3_600_000), allDay, source: "manual", createdBy: "ai-command", taskId });
          }
        } catch (actErr) {
          await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: rule.kind });
        }
      }

      await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
    }

  }

  return { evaluated, fired, retired };
}

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const { evaluated, fired, retired } = await runDueRules();
    await recordEvent("cron.ori-automations", "ok", { evaluated, fired, retired });
    return NextResponse.json({ ok: true, evaluated, fired, retired });
  } catch (err) {
    await reportError(err, { route: "cron.ori-automations" });
    await recordEvent("cron.ori-automations", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "ORI automation run failed." }, { status: 500 });
  }
}
