// Phase 2 of "the system moves on its own" — TIME spawns work. On a daily tick
// (cron) or on demand, this CREATES the work a passing date implies, instead of
// only alerting: a renewal task for an expiring/expired renewable document, and a
// notice task for a lease/insurance/contract entering its notice window.
//
// Same rails as Phase 1: every creation is logged to automation_events (kind
// "task-create", undoable = archive the task), so it shows in the Automations feed
// and can be reversed in one click. Fully guarded — never throws.

import { sb } from "@/db/supabase";
import { listDocuments, getDocument, linkDocumentTask, type DocumentRow } from "@/lib/documents";
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

type CommitmentRow = { id: number; kind: string; title: string; company_id: number | null; end_date: string | null; notice_days: number | null; status: string };

/** Create + link the renewal task for a renewable document. Shared by the Auto
 *  path and the "Apply" of a renewal suggestion. */
async function createRenewalTask(document: DocumentRow): Promise<{ taskId: number; code: string }> {
  const now = new Date();
  const companyId = document.companyId as number;
  const prefix = await companyPrefix(companyId);
  const title = `Renew: ${document.title}`;
  const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
    actionItem: title, status: "Not Started", priority: "High", category: "Admin",
    deadline: document.expiryDate, createdDate: now, lastUpdatedAt: now, archived: false,
  });
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task",
    old_value: null, new_value: title, change_reason: "Created by automation — document expiring", created_at: now.toISOString(), created_by: "automation",
  });
  await linkDocumentTask(document.id, task.id);
  return { taskId: task.id, code: task.code };
}

/** Create the notice task for a commitment. Shared by Auto + Apply. */
async function createCommitmentTask(c: CommitmentRow, urgent: boolean): Promise<{ taskId: number; code: string; title: string }> {
  const now = new Date();
  const companyId = c.company_id as number;
  const prefix = await companyPrefix(companyId);
  const label = KIND_LABEL[c.kind as CommitmentKind] ?? "Commitment";
  const title = `${label} notice: ${c.title}`;
  const nb = noticeByDate({ endDate: c.end_date, noticeDays: c.notice_days });
  const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
    actionItem: title, status: "Not Started", priority: urgent ? "Critical" : "High", category: "Admin",
    deadline: nb, createdDate: now, lastUpdatedAt: now, archived: false,
  });
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task",
    old_value: null, new_value: title, change_reason: "Created by automation — commitment notice", created_at: now.toISOString(), created_by: "automation",
  });
  return { taskId: task.id, code: task.code, title };
}

/** Record a "create a task" SUGGESTION (Suggest mode) that remembers its source —
 *  a document (renewal) or a commitment (notice) — so Apply can create it later. */
async function suggestTaskCreate(opts: { source: "documents" | "commitments"; sourceId: number; documentId: number | null; companyId: number | null; personId: number | null; summary: string; detail: string }): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("automation_events").insert({
    kind: "task-create", status: "suggested", document_id: opts.documentId, target_table: opts.source, target_id: opts.sourceId,
    person_id: opts.personId, company_id: opts.companyId, summary: opts.summary, detail: opts.detail,
    prev_value: null, new_value: null, created_at: now, acted_at: null, created_by: "automation",
  });
}

type ProbationPerson = { id: number; name: string; company_id: number | null; manager_id: number | null; probation_end_date: string | null };

/** Create the probation-review task for a person. Shared by Auto + Apply. */
async function createProbationTask(p: ProbationPerson): Promise<{ taskId: number; code: string; title: string }> {
  const now = new Date();
  const companyId = p.company_id as number;
  const prefix = await companyPrefix(companyId);
  const title = `Probation review: ${p.name}`;
  const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
    actionItem: title, ownerId: (p.manager_id as number | null) ?? null, status: "Not Started",
    priority: "High", category: "HR",
    deadline: p.probation_end_date ? new Date(p.probation_end_date) : null,
    createdDate: now, lastUpdatedAt: now, archived: false,
  });
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task",
    old_value: null, new_value: title, change_reason: "Created by automation — probation ending", created_at: now.toISOString(), created_by: "automation",
  });
  return { taskId: task.id, code: task.code, title };
}

/** Apply a renewal/notice SUGGESTION — create the task now from its remembered
 *  source. Returns the new task so the feed can repoint the event for Undo. */
export async function createTaskFromSuggestion(row: { target_table: string; target_id: number }): Promise<{ taskId: number; code: string }> {
  if (row.target_table === "documents") {
    const doc = await getDocument(row.target_id);
    if (!doc || !doc.companyId) throw new Error("That document is no longer available.");
    return createRenewalTask(doc);
  }
  if (row.target_table === "commitments") {
    const { data } = await sb.from("commitments").select("id,kind,title,company_id,end_date,notice_days,status").eq("id", row.target_id).maybeSingle();
    const c = data as CommitmentRow | null;
    if (!c || !c.company_id) throw new Error("That commitment is no longer available.");
    const urg = commitmentUrgency({ endDate: c.end_date, noticeDays: c.notice_days, status: c.status });
    return createCommitmentTask(c, urg === "overdue");
  }
  if (row.target_table === "people") {
    const { data } = await sb.from("people").select("id,name,company_id,manager_id,probation_end_date").eq("id", row.target_id).maybeSingle();
    const p = data as ProbationPerson | null;
    if (!p || !p.company_id) throw new Error("That person is no longer available.");
    return createProbationTask(p);
  }
  throw new Error("Unknown suggestion source.");
}

/** Run the time-based automations. Returns how many work items were created. */
export async function runTimeAutomations(): Promise<{ renewals: number; commitments: number; probations: number }> {
  let renewals = 0;
  let commitments = 0;
  let probations = 0;
  // Respect the control-room mode: "off" disables spawning work entirely;
  // "suggest" records a one-click suggestion instead of creating the task.
  const mode = await getAutomationMode("task-create");
  if (mode === "off") return { renewals, commitments, probations };
  const suggesting = mode === "suggest";
  const baseline = await getOrInitBaseline(); // forward-only: skip the existing backlog

  // 1. Renewals for expiring/expired renewable documents. getDocumentRenewal-
  //    Candidates excludes docs with an OPEN linked task; we ALSO skip any doc that
  //    already has a pending/applied task-create event (so a suggestion isn't
  //    re-proposed, and an undone task isn't re-created).
  try {
    const docs = await listDocuments();
    const candidates = await getDocumentRenewalCandidates(docs);
    for (const { document, status } of candidates) {
      if (!document.companyId) continue; // renewal tasks are company-owned
      if (!document.expiryDate || document.expiryDate < baseline) continue; // forward-only
      const { data: ex } = await sb.from("automation_events").select("id").eq("kind", "task-create").eq("document_id", document.id).in("status", ["suggested", "applied"]).limit(1);
      if (ex && ex.length) continue;
      const word = status === "Expired" ? "expired" : "expiring";
      if (suggesting) {
        await suggestTaskCreate({
          source: "documents", sourceId: document.id, documentId: document.id, companyId: document.companyId, personId: document.personId,
          summary: `Create renewal task — ${word}: “${document.title}”`, detail: `${status} document — renewal task for ${document.title}`,
        });
      } else {
        const t = await createRenewalTask(document);
        await logTaskCreate({
          documentId: document.id, companyId: document.companyId, personId: document.personId, taskId: t.taskId, taskCode: t.code,
          summary: `Created renewal task ${t.code} — ${word}: “${document.title}”`, detail: `${status} document — auto-created its renewal task`,
        });
      }
      renewals++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "renewals", message: e instanceof Error ? e.message : String(e) });
  }

  // 2. Notices for commitments entering (or past) their notice window.
  try {
    const { data: rows } = await sb.from("commitments").select("id,kind,title,company_id,end_date,notice_days,status").eq("archived", false);
    for (const c of (rows ?? []) as CommitmentRow[]) {
      const companyId = c.company_id;
      if (!companyId) continue;
      const urg = commitmentUrgency({ endDate: c.end_date, noticeDays: c.notice_days, status: c.status });
      if (urg !== "overdue" && urg !== "soon") continue;
      const nbForward = noticeByDate({ endDate: c.end_date, noticeDays: c.notice_days });
      if (!nbForward || nbForward < baseline) continue; // forward-only
      // Dedup across ALL statuses, keyed by the commitment id in detail.
      const { data: existing } = await sb.from("automation_events").select("id").eq("kind", "task-create").ilike("detail", `commitment:${c.id}|%`).limit(1);
      if (existing && existing.length) continue;
      const label = KIND_LABEL[c.kind as CommitmentKind] ?? "Commitment";
      const word = urg === "overdue" ? "overdue" : "due soon";
      if (suggesting) {
        await suggestTaskCreate({
          source: "commitments", sourceId: c.id, documentId: null, companyId, personId: null,
          summary: `Create ${label.toLowerCase()} notice task — ${word}: “${c.title}”`, detail: `commitment:${c.id}| Notice ${urg} — act to renew or exit`,
        });
      } else {
        const t = await createCommitmentTask(c, urg === "overdue");
        await logTaskCreate({
          documentId: null, companyId, personId: null, taskId: t.taskId, taskCode: t.code,
          summary: `Created task ${t.code} — ${label.toLowerCase()} notice ${word}: “${c.title}”`, detail: `commitment:${c.id}| Notice ${urg} — act to renew or exit`,
        });
      }
      commitments++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "commitments", message: e instanceof Error ? e.message : String(e) });
  }

  // 3. Probation reviews — a person whose probation ends within 14 days (or has
  //    just passed, forward-only) and has no review task yet. Manager owns it.
  try {
    const horizon = new Date(); horizon.setHours(0, 0, 0, 0); horizon.setDate(horizon.getDate() + 14);
    const { data: rows } = await sb
      .from("people")
      .select("id,name,company_id,manager_id,probation_end_date")
      .eq("active", true)
      .not("probation_end_date", "is", null)
      .not("company_id", "is", null)
      .lte("probation_end_date", horizon.toISOString());
    for (const p of (rows ?? []) as ProbationPerson[]) {
      if (!p.company_id || !p.probation_end_date) continue;
      if (new Date(p.probation_end_date) < baseline) continue; // forward-only: skip old backlog
      // Dedup across ALL statuses, keyed by the person id in detail.
      const { data: existing } = await sb.from("automation_events").select("id").eq("kind", "task-create").ilike("detail", `probation:${p.id}|%`).limit(1);
      if (existing && existing.length) continue;
      if (suggesting) {
        await sb.from("automation_events").insert({
          kind: "task-create", status: "suggested", document_id: null, target_table: "people", target_id: p.id,
          person_id: p.id, company_id: p.company_id, summary: `Create probation review — ${p.name}`,
          detail: `probation:${p.id}| Probation ending — schedule the review`, prev_value: null, new_value: null,
          created_at: new Date().toISOString(), acted_at: null, created_by: "automation",
        });
      } else {
        const t = await createProbationTask(p);
        await logTaskCreate({
          documentId: null, companyId: p.company_id, personId: p.id, taskId: t.taskId, taskCode: t.code,
          summary: `Created probation review ${t.code} — ${p.name}`, detail: `probation:${p.id}| Probation ending — auto-created the review task`,
        });
      }
      probations++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "probations", message: e instanceof Error ? e.message : String(e) });
  }

  await recordEvent("automation.time", "ok", { renewals, commitments, probations });
  return { renewals, commitments, probations };
}
