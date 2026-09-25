// Phase 2 of "the system moves on its own" — TIME spawns work. On a daily tick
// (cron) or on demand, this CREATES the work a passing date implies, instead of
// only alerting: a renewal task for an expiring/expired renewable document, a
// probation review, and the recurring Tax & Legal obligations. (A notice task for
// a commitment entering its notice window went with Commitments, 26 Sept 2026.)
//
// Same rails as Phase 1: every creation is logged to automation_events (kind
// "task-create"), so it shows in the Automations feed. Fully guarded — never throws.

import { sb } from "@/db/supabase";
import { listDocuments, linkDocumentTask, type DocumentRow } from "@/lib/documents/documents";
import { getDocumentRenewalCandidates } from "@/lib/automation/automation-suggestions";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getAutomationMode } from "@/lib/automation/automation-reactions";
import { getAppSettings } from "@/lib/settings";
import { recordEvent } from "@/lib/system-events";
import { listObligations, dueObligationInstances, type DueObligationInstance } from "@/lib/operations/recurring";

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

/** Create + link the renewal task for a renewable document (the Auto path). */
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

/** Record a "create a task" SUGGESTION (Suggest mode) that remembers its source —
 *  a document (renewal) — so it shows in the feed. */
async function suggestTaskCreate(opts: { source: "documents"; sourceId: number; documentId: number | null; companyId: number | null; personId: number | null; summary: string; detail: string }): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("automation_events").insert({
    kind: "task-create", status: "suggested", document_id: opts.documentId, target_table: opts.source, target_id: opts.sourceId,
    person_id: opts.personId, company_id: opts.companyId, summary: opts.summary, detail: opts.detail,
    prev_value: null, new_value: null, created_at: now, acted_at: null, created_by: "automation",
  });
}

type ProbationPerson = { id: number; name: string; company_id: number | null; manager_id: number | null; probation_end_date: string | null };

/** Create the probation-review task for a person. */
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

// Valid task categories; an obligation's statutory category is mapped onto these
// (anything unrecognised → Admin) so the spawned task always has a clean category.
const TASK_CATEGORIES = new Set([
  "Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other",
]);
function obligationCategory(category: string | null | undefined): string {
  const c = (category ?? "").trim();
  return TASK_CATEGORIES.has(c) ? c : "Admin";
}

/** Create the "do this recurring obligation" task for one company. The deadline is the obligation's computed due date for this period. */
async function createObligationTask(o: DueObligationInstance): Promise<{ taskId: number; code: string; title: string }> {
  const now = new Date();
  const companyId = o.companyId;
  const prefix = await companyPrefix(companyId);
  const title = `${o.label}`;
  const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
    actionItem: title, status: "Not Started",
    priority: o.flag === "overdue" ? "Critical" : "High",
    category: obligationCategory(o.category),
    deadline: o.dueDate, createdDate: now, lastUpdatedAt: now, archived: false,
  });
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task",
    old_value: null, new_value: title, change_reason: "Created by automation — recurring obligation due", created_at: now.toISOString(), created_by: "automation",
  });
  return { taskId: task.id, code: task.code, title };
}

/* ------------------------------------------------------------------ */
/* Phase 4 — cross-process cascades. One process finishing spawns the  */
/* next step. Each is gated by the task-create mode, deduped and      */
/* logged; they create TASKS only (never toggle a todo), so they       */
/* can't loop back into their own trigger.                             */
/* ------------------------------------------------------------------ */

/** Onboarding all done → schedule the probation review (shares the `probation:<id>`
 *  dedup key with the time sweep, so the two never double-create). */
export async function cascadeOnboardingComplete(personId: number): Promise<void> {
  try {
    const mode = await getAutomationMode("task-create");
    if (mode === "off") return;
    const { data: p } = await sb.from("people").select("id,name,company_id,manager_id,probation_end_date,active").eq("id", personId).maybeSingle();
    if (!p || !p.active || !p.company_id || !p.probation_end_date) return; // no probation to schedule
    const { data: steps } = await sb.from("todos").select("id,done").eq("person_id", personId).eq("kind", "onboarding");
    if (!steps || steps.length === 0 || steps.some((s) => !s.done)) return; // not fully onboarded yet
    const { data: ex } = await sb.from("automation_events").select("id").eq("kind", "task-create").ilike("detail", `probation:${personId}|%`).limit(1);
    if (ex && ex.length) return; // already handled (here or by the time sweep)
    if (mode === "suggest") {
      await sb.from("automation_events").insert({
        kind: "task-create", status: "suggested", document_id: null, target_table: "people", target_id: personId,
        person_id: personId, company_id: p.company_id, summary: `Create probation review — ${p.name}`,
        detail: `probation:${personId}| Onboarding complete — schedule the review`, prev_value: null, new_value: null,
        created_at: new Date().toISOString(), acted_at: null, created_by: "automation",
      });
    } else {
      const t = await createProbationTask(p as ProbationPerson);
      await logTaskCreate({ documentId: null, companyId: p.company_id, personId, taskId: t.taskId, taskCode: t.code,
        summary: `Created probation review ${t.code} — ${p.name}`, detail: `probation:${personId}| Onboarding complete — auto-created the review` });
    }
  } catch (e) {
    await recordEvent("automation.cascade", "error", { step: "onboarding", personId, message: e instanceof Error ? e.message : String(e) });
  }
}

// Cap how many obligation tasks one sweep can spawn — a safety bound so a fresh
// install (or a wide lead window) can't dump a huge batch in one tick.
const MAX_OBLIGATION_TASKS_PER_RUN = 40;

/** Run the time-based automations. Returns how many work items were created. */
export async function runTimeAutomations(): Promise<{ renewals: number; probations: number; obligations: number }> {
  let renewals = 0;
  let probations = 0;
  let obligations = 0;
  // Respect the control-room mode: "off" disables spawning work entirely;
  // "suggest" records a one-click suggestion instead of creating the task.
  const mode = await getAutomationMode("task-create");
  if (mode === "off") return { renewals, probations, obligations };
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
      const { data: ex } = await sb.from("automation_events").select("id").eq("kind", "task-create").eq("document_id", document.id).limit(1); // any status — a DISMISSED suggestion must not come back every morning
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

  // 2. Probation reviews — a person whose probation ends within 14 days (or has
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

  // 3. Recurring obligations — the Tax & Legal cadence grid. For each obligation
  //    now DUE (inside its lead window, this period) and applicable to a company
  //    that hasn't ticked it, spawn a task to do it. Due-ness + per-company
  //    applicability + "done this period" all come from dueObligationInstances
  //    (which reuses outstandingDeadlines) — nothing about cadence is reinvented.
  //    Deduped one-task-per-obligation+company+period via a stable key in detail,
  //    so it never re-spawns within a period (and an undone task isn't re-created).
  try {
    // Master Tax & Legal pause: when on, the recurring-obligation cadence is
    // frozen — no tax/legal tasks are spawned. On unpause the baseline is reset
    // (see setCommandCentrePause) so this resumes from a clean slate, never
    // back-filling obligations that fell due while paused.
    const { commandCentrePaused } = await getAppSettings();
    const obList = commandCentrePaused ? [] : await listObligations();
    const due = commandCentrePaused ? [] : await dueObligationInstances(obList);
    for (const o of due) {
      if (obligations >= MAX_OBLIGATION_TASKS_PER_RUN) break; // bounded per run
      // Forward-only: skip anything whose deadline fell before the baseline so
      // enabling automation doesn't dump the existing statutory backlog. (Undated
      // annual anchors are already filtered out upstream — they have no period.)
      if (o.dueDate && o.dueDate < baseline) continue;
      // Dedup across ALL statuses, keyed by obligation+company+period in detail.
      const { data: existing } = await sb.from("automation_events").select("id").eq("kind", "task-create").ilike("detail", `${o.key}|%`).limit(1);
      if (existing && existing.length) continue;
      const word = o.flag === "overdue" ? "overdue" : "due";
      if (suggesting) {
        await sb.from("automation_events").insert({
          kind: "task-create", status: "suggested", document_id: null, target_table: "recurring_obligations", target_id: o.obligationId,
          person_id: null, company_id: o.companyId, summary: `Create task — ${word}: “${o.label}” (${o.companyName})`,
          detail: `${o.key}| Recurring obligation ${word} — create the task to do it`, prev_value: null, new_value: null,
          created_at: new Date().toISOString(), acted_at: null, created_by: "automation",
        });
      } else {
        const t = await createObligationTask(o);
        await logTaskCreate({
          documentId: null, companyId: o.companyId, personId: null, taskId: t.taskId, taskCode: t.code,
          summary: `Created task ${t.code} — ${word}: “${o.label}” (${o.companyName})`,
          detail: `${o.key}| Recurring obligation ${word} — auto-created the task`,
        });
      }
      obligations++;
    }
  } catch (e) {
    await recordEvent("automation.time", "error", { step: "obligations", message: e instanceof Error ? e.message : String(e) });
  }

  await recordEvent("automation.time", "ok", { renewals, probations, obligations });
  return { renewals, probations, obligations };
}
