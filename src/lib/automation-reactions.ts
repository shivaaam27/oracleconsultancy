// Automation reaction layer ("the system moves on its own"). When a document is
// FILED, this advances the processes it touches. The guardrail (owner's choice):
// CERTAIN matches are applied automatically; fuzzier ones are recorded as
// suggestions for a one-click Apply. EVERY action is logged to automation_events
// with enough to UNDO it, so the self-moving system stays visible and reversible.
//
// Reactions are best-effort and fully guarded — a reaction failure must NEVER
// block the document from filing.

import { sb } from "@/db/supabase";
import { getDocument } from "@/lib/documents";
import { verifyRequirement, unverifyRequirement, getPersonChecklist } from "@/lib/requirements";
import { verifyCompanyRequirement, unverifyCompanyRequirement } from "@/lib/company-requirements";
import { setPipelineStage, pipelineForTask } from "@/lib/pipeline";
import { PIPELINE_STAGES, inferPipelineStage, type PipelineStage } from "@/lib/pipeline-shared";
import { toggleTodo } from "@/app/todos/actions";
import { addTaskUpdate } from "@/app/task/actions";
import { recordEvent } from "@/lib/system-events";
import { DEFAULT_AUTOMATION_MODE, type AutomationMode } from "@/lib/automation-rules";
import type { DocumentRow } from "@/lib/documents-shared";

export type AutomationKind = "compliance-verify" | "task-complete" | "pipeline-advance" | "onboarding-tick";
export type AutomationTable = "person_requirements" | "company_requirements" | "tasks" | "pipeline" | "todos";

type LogInput = {
  kind: AutomationKind;
  status: "applied" | "suggested";
  documentId: number | null;
  targetTable: AutomationTable;
  targetId: number;
  personId: number | null;
  companyId: number | null;
  summary: string;
  detail?: string | null;
  prevValue: string | null;
  newValue: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Don't double-record the same reaction if a document is re-filed/re-saved. */
async function alreadyLogged(documentId: number, kind: AutomationKind, targetTable: string, targetId: number): Promise<boolean> {
  const { data } = await sb
    .from("automation_events")
    .select("id")
    .eq("document_id", documentId)
    .eq("kind", kind)
    .eq("target_table", targetTable)
    .eq("target_id", targetId)
    .in("status", ["suggested", "applied"])
    .limit(1);
  return !!(data && data.length);
}

/** Dedup for cascades that aren't keyed to a triggering document (e.g. assets
 *  returned) — match on the target row + kind alone. */
async function alreadyLoggedByTarget(kind: AutomationKind, targetTable: string, targetId: number): Promise<boolean> {
  const { data } = await sb
    .from("automation_events")
    .select("id")
    .eq("kind", kind)
    .eq("target_table", targetTable)
    .eq("target_id", targetId)
    .in("status", ["suggested", "applied"])
    .limit(1);
  return !!(data && data.length);
}

async function lookupPersonName(id: number): Promise<string> {
  const { data } = await sb.from("people").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | null) ?? "the person";
}

/** The owner's chosen mode for an automation kind (Settings → Automations). */
export async function getAutomationMode(kind: string): Promise<AutomationMode> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", `automation.mode.${kind}`).maybeSingle();
    const v = data?.value as string | null;
    if (v === "auto" || v === "suggest" || v === "off") return v;
  } catch { /* fall through to default */ }
  return DEFAULT_AUTOMATION_MODE;
}

type CommitBase = Omit<LogInput, "status">;

/**
 * Apply or suggest a move, honouring the rule's mode:
 *   off     → nothing; auto + certain → apply; otherwise → suggest.
 * This is the single place the control-room mode is enforced.
 */
async function commit(base: CommitBase, certain: boolean, appliedSummary?: string): Promise<void> {
  const mode = await getAutomationMode(base.kind);
  if (mode === "off") return;
  if (mode === "auto" && certain) {
    await performAutomationMove({ ...base, summary: appliedSummary ?? base.summary });
    await logEvent({ ...base, status: "applied", summary: appliedSummary ?? base.summary });
  } else {
    await logEvent({ ...base, status: "suggested" });
  }
}

async function logEvent(i: LogInput): Promise<void> {
  await sb.from("automation_events").insert({
    kind: i.kind,
    status: i.status,
    document_id: i.documentId,
    target_table: i.targetTable,
    target_id: i.targetId,
    person_id: i.personId,
    company_id: i.companyId,
    summary: i.summary,
    detail: i.detail ?? null,
    prev_value: i.prevValue ?? null,
    new_value: i.newValue ?? null,
    created_at: new Date().toISOString(),
    acted_at: i.status === "applied" ? new Date().toISOString() : null,
    created_by: "automation",
  });
}

async function ownerName(doc: DocumentRow): Promise<string> {
  if (doc.personId) {
    const { data } = await sb.from("people").select("name").eq("id", doc.personId).maybeSingle();
    if (data?.name) return data.name as string;
  }
  if (doc.companyId) {
    const { data } = await sb.from("companies").select("name").eq("id", doc.companyId).maybeSingle();
    if (data?.name) return data.name as string;
  }
  return "the owner";
}

/* ------------------------------------------------------------------ */
/* The shared "do the move" + "undo the move" — used by both the auto  */
/* path here and the Apply/Undo actions, so behaviour is identical.    */
/* ------------------------------------------------------------------ */

type MoveRow = { kind: string; targetTable: string; targetId: number; newValue: string | null; prevValue: string | null; summary: string };

async function taskCode(taskId: number): Promise<string | null> {
  const { data } = await sb.from("tasks").select("code").eq("id", taskId).maybeSingle();
  return (data?.code as string | null) ?? null;
}

/** Perform (or re-perform, on Apply) an automation move. */
export async function performAutomationMove(row: MoveRow): Promise<void> {
  switch (row.kind) {
    case "compliance-verify":
      if (row.targetTable === "person_requirements") await verifyRequirement(row.targetId);
      else await verifyCompanyRequirement(row.targetId);
      return;
    case "task-complete": {
      const code = await taskCode(row.targetId);
      if (code) await addTaskUpdate(row.targetId, code, `Auto-completed — ${row.summary}`, row.newValue || "Completed");
      return;
    }
    case "pipeline-advance":
      if (row.newValue) await setPipelineStage(row.targetId, row.newValue as PipelineStage);
      return;
    case "onboarding-tick":
      await toggleTodo(row.targetId, true);
      return;
  }
}

/** Reverse an applied automation move. */
export async function undoAutomationMove(row: MoveRow): Promise<void> {
  switch (row.kind) {
    case "task-create":
      // Undo a time-spawned task by archiving it (recoverable, not deleted).
      await sb.from("tasks").update({ archived: true, last_updated_at: new Date().toISOString() }).eq("id", row.targetId);
      return;
    case "compliance-verify":
      if (row.targetTable === "person_requirements") await unverifyRequirement(row.targetId);
      else await unverifyCompanyRequirement(row.targetId);
      return;
    case "task-complete": {
      const code = await taskCode(row.targetId);
      if (code) await addTaskUpdate(row.targetId, code, "Reopened — automation undone", row.prevValue || "In Progress");
      return;
    }
    case "pipeline-advance":
      if (row.prevValue) await setPipelineStage(row.targetId, row.prevValue as PipelineStage);
      return;
    case "onboarding-tick":
      await toggleTodo(row.targetId, false);
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Entry point: react to a freshly-filed document.                     */
/* ------------------------------------------------------------------ */

export async function reactToFiledDocument(documentId: number): Promise<void> {
  try {
    const doc = await getDocument(documentId);
    if (!doc || doc.archived || doc.intakeState !== "filed") return;
    const who = await ownerName(doc);
    // Each reaction is independently guarded so one failure never stops the rest.
    await Promise.allSettled([
      reactCompliance(doc, who),
      reactLinkedTasks(doc, who),
      reactPipeline(doc, who),
      reactOnboarding(doc, who),
      cascadeComplianceComplete(doc, who),
    ]);
  } catch (e) {
    await recordEvent("automation.react", "error", { documentId, message: e instanceof Error ? e.message : String(e) });
  }
}

/** Compliance: a document the matcher auto-linked to a requirement → verify it.
 *  CERTAIN when the read was clean (not needs-review, not an awaiting-original
 *  photo); otherwise suggest. Reuses the system's own auto-link as the signal. */
async function reactCompliance(doc: DocumentRow, who: string): Promise<void> {
  try {
    const clean = doc.reviewStatus === "ok" && !doc.needsOriginal;
    for (const table of ["person_requirements", "company_requirements"] as const) {
      const { data } = await sb.from(table).select("id,status").eq("document_id", doc.id).limit(20);
      for (const r of data ?? []) {
        const status = (r.status as string | null) ?? "received";
        if (status === "verified" || status === "waived") continue;
        const targetId = r.id as number;
        if (await alreadyLogged(doc.id, "compliance-verify", table, targetId)) continue;
        const base = { kind: "compliance-verify" as const, documentId: doc.id, targetTable: table, targetId, personId: doc.personId, companyId: doc.companyId, summary: `Verify “${doc.title}” for ${who}`, detail: "Auto-linked to a compliance requirement", prevValue: status, newValue: "verified" };
        await commit(base, clean, `Verified “${doc.title}” for ${who}`);
      }
    }
  } catch { /* best-effort */ }
}

/** Tasks: an open task explicitly linked (document_links) to this document — or to
 *  the document it supersedes — is fulfilled by it → complete it. Always CERTAIN
 *  (an explicit link), so it auto-completes. */
async function reactLinkedTasks(doc: DocumentRow, who: string): Promise<void> {
  try {
    const docIds = [doc.id, doc.supersedesId].filter((x): x is number => !!x);
    const { data: links } = await sb.from("document_links").select("task_id").in("document_id", docIds);
    const taskIds = [...new Set((links ?? []).map((l) => l.task_id as number))];
    if (!taskIds.length) return;
    const { data: tasks } = await sb.from("tasks").select("id,code,title,status").in("id", taskIds);
    for (const t of tasks ?? []) {
      const status = t.status as string;
      if (status === "Completed" || status === "Closed") continue;
      const targetId = t.id as number;
      if (await alreadyLogged(doc.id, "task-complete", "tasks", targetId)) continue;
      const base = { kind: "task-complete" as const, documentId: doc.id, targetTable: "tasks" as const, targetId, personId: doc.personId, companyId: doc.companyId, summary: `Complete task ${t.code} — “${doc.title}” filed`, detail: `Document linked to ${t.code}`, prevValue: status, newValue: "Completed" };
      await commit(base, true, `Completed task ${t.code} — “${doc.title}” filed`);
    }
  } catch { /* best-effort */ }
}

/** Pipeline: advance the application a document belongs to. CERTAIN when the item
 *  is linked to this exact document or its control number matches; else suggest. */
async function reactPipeline(doc: DocumentRow, who: string): Promise<void> {
  try {
    if (!doc.companyId && !doc.personId) return;
    const target = inferPipelineStage(doc);
    if (!target) return;
    const targetIdx = PIPELINE_STAGES.indexOf(target);
    let q = sb.from("pipeline").select("id,type,stage,control_no,company_id,person_id,document_id").eq("archived", false);
    // Match the document's owner (company or person).
    if (doc.companyId) q = q.eq("company_id", doc.companyId);
    else q = q.eq("person_id", doc.personId as number);
    const { data } = await q;
    const refKey = doc.referenceNo ? norm(doc.referenceNo) : null;
    const typeHay = norm(`${doc.title} ${doc.docType ?? ""} ${doc.category ?? ""}`);
    for (const p of data ?? []) {
      const curIdx = PIPELINE_STAGES.indexOf((p.stage as string) as PipelineStage);
      if (curIdx < 0 || targetIdx <= curIdx) continue; // only advance forward
      const certain = (p.document_id as number | null) === doc.id || (refKey && p.control_no && norm(p.control_no as string) === refKey);
      const typeMatch = norm(p.type as string).split(" ").some((w) => w.length >= 4 && typeHay.includes(w));
      if (!certain && !typeMatch) continue;
      const targetId = p.id as number;
      if (await alreadyLogged(doc.id, "pipeline-advance", "pipeline", targetId)) continue;
      const base = { kind: "pipeline-advance" as const, documentId: doc.id, targetTable: "pipeline" as const, targetId, personId: doc.personId, companyId: doc.companyId, summary: `Advance ${p.type} → ${target} for ${who}`, detail: `From ${p.stage} (matched ${certain ? "control no." : "type"})`, prevValue: p.stage as string, newValue: target };
      await commit(base, !!certain, `Advanced ${p.type} → ${target}`);
    }
  } catch { /* best-effort */ }
}

/* ------------------------------------------------------------------ */
/* Phase 3 — cross-process cascades (one process completing nudges the */
/* next). Both reuse the onboarding-tick kind + undo (toggleTodo).     */
/* ------------------------------------------------------------------ */

/** When filing a document pushes a person's MANDATORY compliance to 100%, tick
 *  the onboarding "collect & verify documents" step — closing the compliance loop.
 *  Runs as part of reactToFiledDocument (after the compliance verify). */
async function cascadeComplianceComplete(doc: DocumentRow, who: string): Promise<void> {
  try {
    if (!doc.personId) return;
    const chk = await getPersonChecklist(doc.personId);
    if (!chk || chk.mandatoryTotal === 0) return;
    // Only when EVERY mandatory item is satisfied (verified, none missing/expired).
    if (chk.score < 100 || chk.missingMandatory > 0 || chk.expiredMandatory > 0) return;
    const { data } = await sb.from("todos").select("id,title").eq("person_id", doc.personId).eq("kind", "onboarding").eq("done", false).limit(40);
    for (const td of data ?? []) {
      if (!/document|compliance|collect/.test(norm(td.title as string))) continue;
      const targetId = td.id as number;
      if (await alreadyLoggedByTarget("onboarding-tick", "todos", targetId)) continue;
      const base = { kind: "onboarding-tick" as const, documentId: doc.id, targetTable: "todos" as const, targetId, personId: doc.personId, companyId: doc.companyId, summary: `Onboarding step “${td.title}” done — compliance complete for ${who}`, detail: "All required documents collected & verified", prevValue: "open", newValue: "done" };
      await commit(base, true);
      break; // one step is enough
    }
  } catch { /* best-effort */ }
}

/** When a task that DRIVES a pipeline case is completed, advance that case one
 *  stage. CERTAIN — the link is explicit (pipeline.task_id), so it auto-applies.
 *  Called after a task's status is written (the open→closed transition). Deduped
 *  per (case, from-stage) so it advances once per completion, not on every path. */
export async function reactToTaskStatusChange(taskId: number, wasStatus: string, nowStatus: string): Promise<void> {
  try {
    const isClosed = (s: string) => s === "Completed" || s === "Closed";
    if (!isClosed(nowStatus) || isClosed(wasStatus)) return; // only on open → closed
    const p = await pipelineForTask(taskId);
    if (!p) return;
    const curIdx = PIPELINE_STAGES.indexOf(p.stage as PipelineStage);
    if (curIdx < 0 || curIdx >= PIPELINE_STAGES.length - 1) return; // unknown or already Issued
    const next = PIPELINE_STAGES[curIdx + 1];
    // Dedup THIS advance (same case, same from-stage) so two write paths firing for
    // one completion don't double-advance — but later stages can still advance.
    const { data: dup } = await sb
      .from("automation_events")
      .select("id").eq("kind", "pipeline-advance").eq("target_table", "pipeline").eq("target_id", p.id).eq("prev_value", p.stage).in("status", ["applied", "suggested"]).limit(1);
    if (dup && dup.length) return;
    const code = await taskCode(taskId);
    const base = { kind: "pipeline-advance" as const, documentId: null, targetTable: "pipeline" as const, targetId: p.id, personId: p.personId, companyId: p.companyId, summary: `Advance ${p.type} → ${next}${code ? ` (task ${code} done)` : ""}`, detail: `Driving task completed — advanced from ${p.stage}`, prevValue: p.stage, newValue: next };
    await commit(base, true, `Advanced ${p.type} → ${next}${code ? ` (task ${code} done)` : ""}`);
  } catch { /* best-effort */ }
}

/** When all of a person's assets are returned (offboarding), tick the offboarding
 *  "return equipment" step. Called from the offboarding path after assets are
 *  freed. CERTAIN (the offboarding flow just returned everything). */
export async function reactToOffboardingAssetsReturned(personId: number): Promise<void> {
  try {
    const who = await lookupPersonName(personId);
    const { data } = await sb.from("todos").select("id,title").eq("person_id", personId).eq("kind", "offboarding").eq("done", false).limit(40);
    for (const td of data ?? []) {
      if (!/return equipment|return.*asset/.test(norm(td.title as string))) continue;
      const targetId = td.id as number;
      if (await alreadyLoggedByTarget("onboarding-tick", "todos", targetId)) continue;
      const base = { kind: "onboarding-tick" as const, documentId: null, targetTable: "todos" as const, targetId, personId, companyId: null, summary: `Offboarding step “${td.title}” done — equipment returned for ${who}`, detail: "All assets returned via the Asset Register", prevValue: "open", newValue: "done" };
      await commit(base, true);
      break;
    }
  } catch { /* best-effort */ }
}

/** Onboarding: a new hire's document ticks the matching onboarding step. CERTAIN
 *  when the step's label clearly names this document's category; else suggest. */
async function reactOnboarding(doc: DocumentRow, who: string): Promise<void> {
  try {
    if (!doc.personId) return;
    const { data } = await sb.from("todos").select("id,title").eq("person_id", doc.personId).eq("kind", "onboarding").eq("done", false).limit(40);
    const cat = norm(doc.category);
    const titleHay = norm(doc.title);
    for (const td of data ?? []) {
      const stepTitle = norm(td.title as string);
      if (!stepTitle) continue;
      // Strong: the step names this document's category (e.g. "Collect passport").
      const strong = !!cat && cat.length >= 4 && stepTitle.includes(cat);
      // Weak: the step and the document title share a meaningful word.
      const weak = stepTitle.split(" ").some((w) => w.length >= 5 && titleHay.includes(w));
      if (!strong && !weak) continue;
      const targetId = td.id as number;
      if (await alreadyLogged(doc.id, "onboarding-tick", "todos", targetId)) continue;
      const base = { kind: "onboarding-tick" as const, documentId: doc.id, targetTable: "todos" as const, targetId, personId: doc.personId, companyId: doc.companyId, summary: `Onboarding step “${td.title}” done — ${who}`, detail: `Satisfied by “${doc.title}”`, prevValue: "open", newValue: "done" };
      await commit(base, strong);
    }
  } catch { /* best-effort */ }
}
