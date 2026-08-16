/**
 * agent-apply.ts — writes back the result a Claude Code cloud agent submits.
 *
 * ⚠️ NOT IMPORTED ANYWHERE YET, AND THAT IS DELIBERATE. This and
 * `agent-context.ts` are groundwork for MCP Stage 4 (the automatic lane), the
 * one stage never started — see memory/mcp_stage4_automatic.md. A dead-code
 * sweep in Aug 2026 deleted 15 genuinely obsolete modules and spared these two
 * on purpose. Don't remove them because nothing imports them; that is the point.
 */

import { sb } from "@/db/supabase";
import type { AiJob } from "./ai-jobs";
import { recordEvent } from "./system-events";
import { canAutoSend, type SendChannel } from "./guardrails";

/** Log every AI-applied side-effect to the activity feed so an autonomous action
 *  is never silent — the audit's "no trail" gap. Best-effort, never throws. */
async function logApply(job: AiJob, action: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await recordEvent("ai.apply", "ok", { jobId: job.id, kind: job.kind, action, ...detail, createdBy: "ai-command" });
  } catch { /* telemetry never blocks an apply */ }
}

/**
 * agent-apply.ts — takes the cloud agent's RESULT for a job and performs the real
 * side-effect (post the answer, create the meeting/task/reminder),
 * reusing the app's own write paths. Runs inside a plain node/tsx worker, so it
 * uses DB/lib-level writes only — NEVER server actions that call revalidatePath/
 * redirect (those throw outside a Next request).
 *
 * Autonomy tiers (memory/cloud_agent_plan.md): internal + undoable actions
 * (answer, create meeting/task) auto-apply; Tier-3 SEND (reminders /
 * messages) only fires when the job is explicitly confirmed — otherwise it's
 * returned as a proposal for the owner to approve.
 */

export type ApplyOutcome = { applied: boolean; detail: Record<string, unknown> };

export async function applyResult(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  switch (job.kind) {
    case "ask":
      return applyAsk(job, result);
    case "action":
      return applyAction(job, result);
    default:
      return { applied: false, detail: { note: `No apply step for kind "${job.kind}"` } };
  }
}

/** Post ORI's answer into the chat thread (if any). */
async function applyAsk(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  const answer = String(result.answer ?? "").trim();
  if (!answer) return { applied: false, detail: { note: "empty answer" } };
  if (job.threadId) {
    const { sendMessage } = await import("@/lib/chat");
    const msgId = await sendMessage({ threadId: job.threadId, sender: "admin", body: answer });
    return { applied: true, detail: { posted: true, messageId: msgId } };
  }
  return { applied: true, detail: { answer } }; // no thread — answer stored on the job
}

/** Create a meeting / task, or PROPOSE a reminder (Tier-3 send needs confirm). */
async function applyAction(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  const action = String(result.action ?? "");
  const confirmed = job.payload.confirmed === true;

  if (action === "create_meeting" && result.meeting) {
    const m = result.meeting as Record<string, unknown>;
    const now = new Date().toISOString();
    const { data, error } = await sb.from("meetings").insert({
      title: String(m.title ?? "Meeting"),
      company_id: (m.companyId as number) ?? null,
      meeting_date: new Date(String(m.meetingDate ?? now)).toISOString(),
      attendees: (m.attendees as string) ?? null,
      raw_notes: String(m.rawNotes ?? ""),
      created_at: now, updated_at: now, created_by: "ai-command", kind: "meeting",
    }).select("id").single();
    if (error) throw new Error(error.message);
    await logApply(job, "create_meeting", { meetingId: data.id, title: m.title });
    return { applied: true, detail: { createdMeeting: data.id } };
  }

  if (action === "create_task" && result.task) {
    const t = result.task as Record<string, unknown>;
    const companyId = Number(t.companyId);
    if (!companyId) return { applied: false, detail: { note: "task needs a companyId" } };
    const { insertTaskWithUniqueCodeSb } = await import("@/lib/db-helpers");
    const created = await insertTaskWithUniqueCodeSb(companyId, "", {
      actionItem: String(t.actionItem ?? "Task"),
      deadline: (t.deadline as string) ?? null,
      ownerId: (t.ownerId as number) ?? null,
      priority: (t.priority as string) ?? "Medium",
      createdDate: new Date(),
      lastUpdatedAt: new Date(),
    });
    if (t.ownerId) {
      await sb.from("task_assignees").upsert(
        { task_id: created.id, person_id: t.ownerId as number, role: "accountable" },
        { onConflict: "task_id,person_id", ignoreDuplicates: true },
      );
    }
    await logApply(job, "create_task", { taskCode: created.code });
    return { applied: true, detail: { createdTask: created.code } };
  }

  if (action === "create_reminder" && result.reminder) {
    const r = result.reminder as Record<string, unknown>;
    const channel: SendChannel = r.channel === "whatsapp" ? "whatsapp" : "email";
    // Tier-3 SEND: needs BOTH an explicit confirm on the job AND the global
    // auto-send guardrail (canAutoSend also honours the automation pause + outreach
    // pause). Either failing → return a proposal, never send silently.
    if (!confirmed || !(await canAutoSend(channel))) {
      return {
        applied: false,
        detail: { proposal: "reminder", reminder: r, needsConfirm: true, reason: !confirmed ? "awaiting confirmation" : "auto-send is off / paused for this channel" },
      };
    }
    const personId = Number(r.personId);
    if (channel === "whatsapp") {
      const { sendTaskReminderWhatsApp } = await import("@/lib/reminders");
      const res = await sendTaskReminderWhatsApp({ personId, sourceTag: "ai-command" });
      await logApply(job, "send_reminder", { channel, personId, ok: res.ok });
      return { applied: res.ok, detail: { reminder: "whatsapp", ...res } };
    }
    const { sendTaskReminderEmail } = await import("@/lib/reminders");
    const res = await sendTaskReminderEmail({ personId, taskId: (r.taskId as number) ?? undefined, note: (r.note as string) ?? null });
    await logApply(job, "send_reminder", { channel, personId, ok: res.ok });
    return { applied: res.ok, detail: { reminder: "email", ...res } };
  }

  return { applied: false, detail: { note: `Unrecognised action "${action}"` } };
}
