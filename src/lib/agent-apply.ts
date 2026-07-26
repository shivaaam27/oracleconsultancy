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

/** Write the resolved fields onto the document (or create one). When the agent
 *  resolved an OWNER, the document is also FILED out of quarantine, its
 *  compliance reconciled and its index refreshed — a smart re-read that left the
 *  doc invisible in quarantine was solving nothing. */
async function applyExtract(job: AiJob, result: Record<string, unknown>): Promise<ApplyOutcome> {
  const documentId = Number(job.payload.documentId ?? 0) || null;
  const companyId = (result.companyId as number) ?? null;
  const personId = (result.personId as number) ?? null;
  // Confidence gate — mirror the intake gate (ai-json LOW_CONFIDENCE = 0.75). A
  // re-read the agent ISN'T confident about must NOT go silently green: it stays
  // "needs_review" so it lands in "Unsure reads" for a human glance. Only a high-
  // confidence read clears the flag. (This used to hard-code "ok" unconditionally,
  // which is why low-confidence docs stopped appearing in the unsure-reads bucket.)
  const conf = typeof result.confidence === "number" ? (result.confidence as number) : null;
  const confident = conf != null && conf >= 0.75;
  const fields = {
    title: (result.title as string) ?? null,
    category: (result.category as string) ?? null,
    doc_type: (result.docType as string) ?? null,
    issuer: (result.issuer as string) ?? null,
    reference_no: (result.referenceNo as string) ?? null,
    issue_date: (result.issueDate as string) ?? null,
    expiry_date: (result.expiryDate as string) ?? null,
    company_id: companyId,
    person_id: personId,
    notes: (result.notes as string) ?? null,
    review_status: (confident ? "ok" : "needs_review") as "ok" | "needs_review",
  };
  if (documentId) {
    await sb.from("documents").update(fields).eq("id", documentId);
    let filed = false;
    // THE SECOND DOOR. This path — the cloud agent re-reading a held document —
    // used to file on `companyId || personId` alone, with no confidence gate: an
    // unconfident read was still filed, merely labelled "needs_review". So while
    // the rules/vision intake sat behind the suggest-only handbrake, the agent
    // was quietly auto-filing anyway. Both doors now obey the SAME rule, or the
    // owner's setting means nothing.
    const { getAppSettings } = await import("@/lib/settings");
    const autoFileMode = (await getAppSettings()).documentAutoFile ?? "high";
    const mayFile =
      (companyId || personId) &&
      autoFileMode !== "off" &&
      (autoFileMode === "all" || confident);
    if (mayFile) {
      // The agent resolved the owner → release the doc from quarantine and run
      // the post-file steps the normal intake would (all lib-level, worker-safe).
      try {
        const { setDocumentIntakeState } = await import("@/lib/documents");
        await setDocumentIntakeState(documentId, "filed", null);
        filed = true;
      } catch { /* leave in quarantine if the state flip fails */ }
      try {
        const { getCompanyChecklist } = await import("@/lib/company-requirements");
        const { getPersonChecklist } = await import("@/lib/requirements");
        if (companyId) await getCompanyChecklist(companyId);
        if (personId) await getPersonChecklist(personId);
      } catch { /* compliance reconcile is best-effort */ }
      try {
        const { reindexEntity } = await import("@/lib/index-hooks");
        void reindexEntity("document", documentId);
      } catch { /* index is best-effort */ }
    } else {
      // Still held. Say WHY in the document's own reason, so the sort queue shows
      // what the deeper re-read concluded instead of leaving the owner to guess
      // whether the agent ever looked at it.
      const why = !(companyId || personId)
        ? "Re-read by ORI — still no company or person could be identified"
        : autoFileMode === "off"
          ? `Re-read by ORI as ${fields.title ?? "this document"} — waiting on you because auto-filing is switched off`
          : `Re-read by ORI at ${conf != null ? `${Math.round(conf * 100)}%` : "low"} confidence — owner looks right but confirm before it counts`;
      try {
        await sb.from("documents").update({ intake_reason: why, updated_at: new Date().toISOString() }).eq("id", documentId);
      } catch { /* reason is best-effort — never blocks the re-read */ }
    }
    await logApply(job, "extract", { documentId, filed });
    return { applied: true, detail: { updatedDocument: documentId, filed } };
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
  await logApply(job, "extract", { createdDocument: id });
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
