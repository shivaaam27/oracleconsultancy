import { sb } from "@/db/supabase";
import type { AiJob } from "./ai-jobs";

/**
 * agent-apply.ts — takes the cloud agent's RESULT for a job and performs the real
 * side-effect (post the answer, file the doc, create the meeting/task/reminder),
 * reusing the app's own write paths. Runs inside a plain node/tsx worker, so it
 * uses DB/lib-level writes only — NEVER server actions that call revalidatePath/
 * redirect (those throw outside a Next request).
 *
 * Autonomy tiers (memory/cloud_agent_plan.md): internal + undoable actions
 * (answer, file doc, create meeting/task) auto-apply; Tier-3 SEND (reminders /
 * messages) only fires when the job is explicitly confirmed — otherwise it's
 * returned as a proposal for the owner to approve.
 */

export type ApplyOutcome = { applied: boolean; detail: Record<string, unknown> };

export async function applyResult(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  switch (job.kind) {
    case "ask":
      return applyAsk(job, result);
    case "extract":
      return applyExtract(job, result);
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

/** Write the resolved fields onto the document (or create one). */
async function applyExtract(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  const documentId = Number(job.payload.documentId ?? 0) || null;
  const fields = {
    title: (result.title as string) ?? null,
    category: (result.category as string) ?? null,
    doc_type: (result.docType as string) ?? null,
    issuer: (result.issuer as string) ?? null,
    reference_no: (result.referenceNo as string) ?? null,
    issue_date: (result.issueDate as string) ?? null,
    expiry_date: (result.expiryDate as string) ?? null,
    company_id: (result.companyId as number) ?? null,
    person_id: (result.personId as number) ?? null,
    notes: (result.notes as string) ?? null,
    review_status: "ok" as const,
  };
  if (documentId) {
    await sb.from("documents").update(fields).eq("id", documentId);
    return { applied: true, detail: { updatedDocument: documentId } };
  }
  const { createDocument } = await import("@/lib/documents");
  const id = await createDocument(
    {
      title: fields.title ?? "Untitled",
      category: fields.category, docType: fields.doc_type, issuer: fields.issuer,
      referenceNo: fields.reference_no, issueDate: fields.issue_date, expiryDate: fields.expiry_date,
      companyId: fields.company_id, personId: fields.person_id, notes: fields.notes,
    } as Parameters<typeof createDocument>[0],
    "ai-command",
  );
  return { applied: true, detail: { createdDocument: id } };
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
    return { applied: true, detail: { createdTask: created.code } };
  }

  if (action === "create_reminder" && result.reminder) {
    const r = result.reminder as Record<string, unknown>;
    if (!confirmed) {
      return { applied: false, detail: { proposal: "reminder", reminder: r, needsConfirm: true } };
    }
    const personId = Number(r.personId);
    if (r.channel === "whatsapp") {
      const { sendTaskReminderWhatsApp } = await import("@/lib/reminders");
      const res = await sendTaskReminderWhatsApp({ personId, sourceTag: "ai-command" });
      return { applied: res.ok, detail: { reminder: "whatsapp", ...res } };
    }
    const { sendTaskReminderEmail } = await import("@/lib/reminders");
    const res = await sendTaskReminderEmail({ personId, taskId: (r.taskId as number) ?? undefined, note: (r.note as string) ?? null });
    return { applied: res.ok, detail: { reminder: "email", ...res } };
  }

  return { applied: false, detail: { note: `Unrecognised action "${action}"` } };
}
