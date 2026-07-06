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
import { evaluateRule, type AutomationRuleRow, type RuleKind } from "@/lib/ori/automations";

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

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const now = new Date();
  const nowIso = now.toISOString();
  let fired = 0, retired = 0, evaluated = 0;

  try {
    const { data: rules } = await sb
      .from("automation_rules")
      .select("id,task_id,company_id,kind,config,active,done,created_at,last_fired_at")
      .eq("active", true).eq("done", false)
      .limit(500);

    for (const raw of (rules ?? []) as Record<string, unknown>[]) {
      const taskId = raw.task_id as number | null;
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
            for (const pid of await assigneeIds(taskId)) {
              await createNotification({ recipient: personRecipient(pid), kind: "assigned", taskId, taskCode: code, title: `${label}: ${code}`, body, actor: "ORI" });
            }
          } else if (rule.kind === "escalate_if_no_update") {
            await sb.from("tasks").update({ status: "Escalated", escalation: "Yes", last_updated_at: nowIso }).eq("id", taskId);
            void reindexEntity("task", taskId);
            const toId = rule.config.escalateToPersonId;
            if (typeof toId === "number") {
              await createNotification({ recipient: personRecipient(toId), kind: "assigned", taskId, taskCode: code, title: `Escalated: ${code}`, body: "No update was posted in time, so ORI escalated this to you.", actor: "ORI" });
            }
            await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI escalated ${code}`, body: "No update in the set window.", actor: "ORI" });
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

    await recordEvent("cron.ori-automations", "ok", { evaluated, fired, retired });
    return NextResponse.json({ ok: true, evaluated, fired, retired });
  } catch (err) {
    await reportError(err, { route: "cron.ori-automations" });
    await recordEvent("cron.ori-automations", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "ORI automation run failed." }, { status: 500 });
  }
}
