// Automation reaction layer ("the system moves on its own"). When a task is
// completed, or an offboarding returns a person's equipment, this advances the
// processes it touches. The guardrail (owner's choice): CERTAIN matches are
// applied automatically; fuzzier ones are recorded as suggestions in the
// feed. EVERY action is logged to automation_events (with its before
// and after values), so the self-moving system stays visible.
//
// Reactions are best-effort and fully guarded — a reaction failure must NEVER
// block the write that triggered it.

import { sb } from "@/db/supabase";
import { toggleTodo } from "@/app/todos/actions";
import { trusted } from "@/lib/viewer";
import { DEFAULT_AUTOMATION_MODE, type AutomationMode } from "@/lib/automation-rules";

// "pipeline-advance" / "pipeline-create" went with Applications (removed 26 Sept
// 2026), and "task-complete" (a filed document completing its linked task) was
// removed as an unwanted feature (Sept 2026); old automation_events rows keep
// those kinds and are simply inert.
export type AutomationKind = "onboarding-tick";
export type AutomationTable = "todos";

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

/* ------------------------------------------------------------------ */
/* Recursion guard. A cascade chain (task done → tick step → schedule  */
/* next review …) reuses the same write primitives the system uses for */
/* ordinary edits, so in theory a move could re-enter the layer and    */
/* loop. We never want a cascade to trigger itself. This in-flight set  */
/* records the cascade signatures running on THIS request; a re-entry   */
/* with the same signature (or one that's already deep) bails out. The  */
/* set is per-process and self-clearing (finally), so it never leaks    */
/* between requests and never throws.                                   */
/* ------------------------------------------------------------------ */
const inFlightCascades = new Set<string>();
const MAX_CASCADE_DEPTH = 8;

/** Run `fn` once per signature within a request; a re-entry (or runaway depth)
 *  is skipped. Always best-effort: a thrown body never escapes, and the guard
 *  always clears. Returns false when the cascade was skipped by the guard. */
async function withCascadeGuard(signature: string, fn: () => Promise<void>): Promise<boolean> {
  if (inFlightCascades.has(signature)) return false;          // same chain already running → don't loop
  if (inFlightCascades.size >= MAX_CASCADE_DEPTH) return false; // runaway chain → stop the cascade
  inFlightCascades.add(signature);
  try {
    await fn();
    return true;
  } catch {
    return false; // best-effort: a cascade failure never propagates
  } finally {
    inFlightCascades.delete(signature);
  }
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

/* ------------------------------------------------------------------ */
/* "Do the move" — used by the auto path in commit() above.            */
/* ------------------------------------------------------------------ */

type MoveRow = { kind: string; targetTable: string; targetId: number; newValue: string | null; prevValue: string | null; summary: string };

/** Perform an automation move. */
async function performAutomationMove(row: MoveRow): Promise<void> {
  switch (row.kind) {
    case "onboarding-tick":
      await trusted(() => toggleTodo(row.targetId, true));
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Phase 3 — cross-process cascades (one process completing nudges the */
/* next). They reuse the onboarding-tick kind (toggleTodo).           */
/* ------------------------------------------------------------------ */

/** When a task is COMPLETED (open → closed), run the state-driven cascade chain:
 *   • a probation-review task → tick the person's "confirm probation/review" step.
 *  (A task that drove an Applications case used to advance it; Applications was
 *  removed 26 Sept 2026.)
 *  Called after a task's status is written. Each chain is independently guarded,
 *  deduped, logged, and protected by the recursion guard so a chain
 *  can't re-enter itself. */
export async function reactToTaskStatusChange(taskId: number, wasStatus: string, nowStatus: string): Promise<void> {
  const isClosed = (s: string) => s === "Completed" || s === "Closed";
  if (!isClosed(nowStatus) || isClosed(wasStatus)) return; // only on open → closed
  // One guard signature per task-completion so the chain below, and anything
  // they touch, can't re-enter this same completion and loop.
  await withCascadeGuard(`task-done:${taskId}`, async () => {
    await Promise.allSettled([cascadeProbationReviewDone(taskId)]);
  });
}

/** Identify the subject of a completed probation-review task and return it.
 *  CERTAIN when the system itself auto-created the task (an automation_events
 *  "task-create" row carries `detail: "probation:<id>|…"` + the person); fuzzy
 *  when only the title "Probation review: <name>" matches a person in the task's
 *  company (covers manually-created reviews) → those are suggested, not applied. */
async function probationSubjectOfTask(taskId: number): Promise<{ personId: number; certain: boolean } | null> {
  // 1. Strong: the task was auto-created by the probation cascade/time sweep.
  const { data: ev } = await sb
    .from("automation_events")
    .select("person_id,detail")
    .eq("kind", "task-create").eq("target_table", "tasks").eq("target_id", taskId)
    .limit(1).maybeSingle();
  if (ev?.person_id != null && /(^|\|)\s*probation:\d+/.test(String(ev.detail ?? ""))) {
    return { personId: ev.person_id as number, certain: true };
  }
  // 2. Fuzzy: title "Probation review: <name>" matched to a person in the company.
  const { data: t } = await sb.from("tasks").select("action_item,company_id").eq("id", taskId).maybeSingle();
  if (!t) return null;
  const title = norm(t.action_item as string | null);
  if (!/\bprobation\b/.test(title) || !/\breview\b/.test(title)) return null;
  const companyId = t.company_id as number | null;
  if (!companyId) return null;
  const { data: candidates } = await sb.from("people").select("id,name").eq("company_id", companyId).eq("active", true);
  // Pick the person whose name is wholly present in the task title (longest wins,
  // so "Ann Marie" beats "Ann" when both exist). No match → don't guess.
  let best: { personId: number; len: number } | null = null;
  for (const person of candidates ?? []) {
    const nm = norm(person.name as string | null);
    if (nm.length >= 3 && title.includes(nm) && (!best || nm.length > best.len)) {
      best = { personId: person.id as number, len: nm.length };
    }
  }
  return best ? { personId: best.personId, certain: false } : null;
}

/** A probation-review task is completed → tick the person's onboarding step that
 *  confirms the probation period / review date, closing the probation loop. The
 *  onboarding-tick kind reuses the existing perform (toggleTodo), so it shows
 *  in the feed. CERTAIN only when the subject is unambiguous
 *  (the system created the review); a title-only match is suggested.
 *
 *  This only TICKS a todo — it never completes another task — so it cannot loop
 *  back into reactToTaskStatusChange; the request-level guard backstops anyway. */
async function cascadeProbationReviewDone(taskId: number): Promise<void> {
  try {
    const subject = await probationSubjectOfTask(taskId);
    if (!subject) return; // not a probation-review task (or no resolvable person)
    const { personId, certain } = subject;
    const { data } = await sb.from("todos").select("id,title").eq("person_id", personId).eq("kind", "onboarding").eq("done", false).limit(40);
    const who = await lookupPersonName(personId);
    for (const td of data ?? []) {
      const stepTitle = norm(td.title as string);
      // The step that confirms probation / schedules the review.
      if (!/probation|review date/.test(stepTitle)) continue;
      const targetId = td.id as number;
      // Dedup on the step itself (this cascade isn't keyed to a document).
      if (await alreadyLoggedByTarget("onboarding-tick", "todos", targetId)) continue;
      const base = { kind: "onboarding-tick" as const, documentId: null, targetTable: "todos" as const, targetId, personId, companyId: null, summary: `Onboarding step “${td.title}” done — probation review complete for ${who}`, detail: "Probation-review task completed", prevValue: "open", newValue: "done" };
      await commit(base, certain);
      break; // one step is enough
    }
  } catch { /* best-effort */ }
}

/** When all of a person's assets are returned (offboarding), tick the offboarding
 *  "return equipment" step. Called from the offboarding path after assets are
 *  freed. CERTAIN (the offboarding flow just returned everything). */
export async function reactToOffboardingAssetsReturned(personId: number): Promise<void> {
  await withCascadeGuard(`offboarding-assets:${personId}`, async () => {
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
  });
}
