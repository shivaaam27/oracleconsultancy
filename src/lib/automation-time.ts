// Phase 2 of "the system moves on its own" — TIME spawns work. On a daily tick
// (cron) or on demand, this CREATES the work a passing date implies, instead of
// only alerting: a renewal task for an expiring/expired renewable document, and a
// notice task for a lease/insurance/contract entering its notice window.
//
// Same rails as Phase 1: every creation is logged to automation_events (kind
// "task-create", undoable = archive the task), so it shows in the Automations feed
// and can be reversed in one click. Fully guarded — never throws.

import { sb } from "@/db/supabase";
import { listDocuments, linkDocumentTask } from "@/lib/documents";
import { getDocumentRenewalCandidates } from "@/lib/automation-suggestions";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { commitmentUrgency, noticeByDate, KIND_LABEL, type CommitmentKind } from "@/lib/commitments-shared";
import { getAutomationMode } from "@/lib/automation-reactions";
import { recordEvent } from "@/lib/system-events";

type LogTaskCreate = {
  documentId: number | null;
  companyId: number | null;
  personId: number | null;
  taskId: number;
  taskCode: string;
  summary: string;
  detail: string;
};

async function logTaskCreate(i: LogTaskCreate): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("automation_events").insert({
    kind: "task-create",
    status: "applied",
    document_id: i.documentId,
    target_table: "tasks",
    target_id: i.taskId,
    person_id: i.personId,
    company_id: i.companyId,
    summary: i.summary,
    detail: i.detail,
    prev_value: null,
    new_value: i.taskCode,
    created_at: now,
    acted_at: now,
    created_by: "automation",
  });
}

async function companyPrefix(companyId: number): Promise<string> {
  const { data } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  return (data?.code_prefix as string | null) || (data?.code as string | null) || "";
}

const BASELINE_KEY = "automation.time.baseline";

/**
 * "Only going forward": capture today's date the first time the time automations
 * run, and only spawn work whose trigger date is on/after it. This freezes out the
 * existing backlog (e.g. ~51 already-expired documents) so enabling automation
 * doesn't dump a pile of tasks — it only acts on dates that pass from now on.
 */
async function getOrInitBaseline(): Promise<Date> {
  const { data } = await sb.from("settings").select("value").eq("key", BASELINE_KEY).maybeSingle();
  const existing = data?.value as string | null;
  if (existing) return new Date(existing);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  await sb.from("settings").upsert({ key: BASELINE_KEY, value: midnight.toISOString() }, { onConflict: "key" });
  return midnight;
}

/** Run the time-based automations. Returns how many work items were created. */
export async function runTimeAutomations(): Promise<{ renewals: number; commitments: number }> {
  let renewals = 0;
  let commitments = 0;
  // Respect the control-room mode: "off" disables spawning work entirely.
  if ((await getAutomationMode("task-create")) === "off") return { renewals, commitments };
  const baseline = await getOrInitBaseline(); // forward-only: skip the existing backlog

  // 1. Renewal tasks for expiring/expired renewable documents. getDocumentRenewal-
  //    Candidates already excludes any document that still has an OPEN linked task —
  //    and an undone (archived) task keeps its open status, so it stays excluded:
  //    undoing a created task does NOT cause it to be recreated next run.
  try {
    const docs = await listDocuments();
    const candidates = await getDocumentRenewalCandidates(docs);
    const now = new Date();
    for (const { document, status } of candidates) {
      if (!document.companyId) continue; // renewal tasks are company-owned
      // Forward-only: skip documents already expired before automation was enabled.
      if (!document.expiryDate || document.expiryDate < baseline) continue;
      const prefix = await companyPrefix(document.companyId);
      const title = `Renew: ${document.title}`;
      const task = await insertTaskWithUniqueCodeSb(document.companyId, prefix, {
        actionItem: title,
        status: "Not Started",
        priority: "High",
        category: "Admin",
        deadline: document.expiryDate,
        createdDate: now,
        lastUpdatedAt: now,
        archived: false,
      });
      await sb.from("audit_log").insert({
        task_id: task.id, task_code: task.code, company_id: document.companyId,
        entry_type: "CREATE", field: "Task", old_value: null, new_value: title,
        change_reason: "Created by automation — document expiring", created_at: now.toISOString(), created_by: "automation",
      });
      await linkDocumentTask(document.id, task.id);
      await logTaskCreate({
        documentId: document.id, companyId: document.companyId, personId: document.personId,
        taskId: task.id, taskCode: task.code,
        summary: `Created renewal task ${task.code} — ${status === "Expired" ? "expired" : "expiring"}: “${document.title}”`,
        detail: `${status} document — auto-created its renewal task`,
      });
      renewals++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "renewals", message: e instanceof Error ? e.message : String(e) });
  }

  // 2. Notice tasks for commitments entering (or past) their notice window.
  try {
    const { data: rows } = await sb
      .from("commitments")
      .select("id,kind,title,company_id,end_date,notice_days,status")
      .eq("archived", false);
    const now = new Date();
    for (const c of rows ?? []) {
      const companyId = c.company_id as number | null;
      if (!companyId) continue;
      const urg = commitmentUrgency({ endDate: c.end_date as string | null, noticeDays: c.notice_days as number | null, status: c.status as string });
      if (urg !== "overdue" && urg !== "soon") continue;
      // Forward-only: skip commitments whose notice window passed before baseline.
      const nbForward = noticeByDate({ endDate: c.end_date as string | null, noticeDays: c.notice_days as number | null });
      if (!nbForward || nbForward < baseline) continue;
      // Dedup across ALL statuses (incl. undone), keyed by the commitment id in
      // detail — so an undone notice task is never silently recreated next run.
      const { data: existing } = await sb
        .from("automation_events")
        .select("id").eq("kind", "task-create").ilike("detail", `commitment:${c.id}|%`).limit(1);
      if (existing && existing.length) continue;
      const prefix = await companyPrefix(companyId);
      const label = KIND_LABEL[c.kind as CommitmentKind] ?? "Commitment";
      const title = `${label} notice: ${c.title}`;
      const nb = noticeByDate({ endDate: c.end_date as string | null, noticeDays: c.notice_days as number | null });
      const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
        actionItem: title,
        status: "Not Started",
        priority: urg === "overdue" ? "Critical" : "High",
        category: "Admin",
        deadline: nb,
        createdDate: now,
        lastUpdatedAt: now,
        archived: false,
      });
      await sb.from("audit_log").insert({
        task_id: task.id, task_code: task.code, company_id: companyId,
        entry_type: "CREATE", field: "Task", old_value: null, new_value: title,
        change_reason: "Created by automation — commitment notice", created_at: now.toISOString(), created_by: "automation",
      });
      await logTaskCreate({
        documentId: null, companyId, personId: null,
        taskId: task.id, taskCode: task.code,
        summary: `Created task ${task.code} — ${label.toLowerCase()} notice ${urg === "overdue" ? "overdue" : "due soon"}: “${c.title}”`,
        detail: `commitment:${c.id}| Notice ${urg} — act to renew or exit`,
      });
      commitments++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "commitments", message: e instanceof Error ? e.message : String(e) });
  }

  await recordEvent("automation.time", "ok", { renewals, commitments });
  return { renewals, commitments };
}
