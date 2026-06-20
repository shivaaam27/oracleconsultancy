// Proactive gap-chasing ("the system chases what's missing"). Where the time
// automations (automation-time.ts) act on a date that PASSES, this acts on a
// HOLE in the records: a company that has directors on file but no TIN, a person
// missing a mandatory document (passport, contract…), or an expired critical
// document with no open renewal task. For each material gap it proposes the task
// that would chase it — instead of waiting for the owner to notice.
//
// SAME RAILS as runTimeAutomations, deliberately:
//   • honour getAutomationMode("task-create") — off / suggest / auto. Default
//     (DEFAULT_AUTOMATION_MODE = "auto") still applies; the owner sets "suggest"
//     to have it only propose. Either way each move is logged + undoable.
//   • forward-only baseline guard — share the time sweep's baseline so enabling
//     gap-chasing doesn't dump the WHOLE existing backlog of gaps as tasks. New
//     gaps (records edited after the baseline) are what get chased going forward.
//   • dedupe on a stable gap KEY in the event detail (`gap:<key>|…`) across ALL
//     statuses, so the same gap never spawns a second task and an undone chase is
//     not re-created — exactly like the commitment/probation sweeps.
//   • capped per run + fully guarded — never throws.
//
// Reuses the existing task-create plumbing: rows are logged as kind "task-create"
// so the Automations feed renders them and Undo (archive the task) works. The one
// extra integration point is the Apply path for a SUGGESTED gap chase, handled by
// createGapChaseFromSuggestion() below and wired into applyAutomationSuggestion.

import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getAutomationMode } from "@/lib/automation-reactions";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { worstComplianceScores, type ComplianceGap } from "@/lib/compliance";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { recordEvent } from "@/lib/system-events";

// Cap how many chases one run proposes — keep it a steady trickle, not a flood,
// even when the backlog of gaps is large.
const MAX_PER_RUN = 10;
// Share the time sweep's forward-only baseline so the two never disagree on what
// counts as "the existing backlog". (Same settings key as automation-time.ts.)
const BASELINE_KEY = "automation.time.baseline";

/** A single proposed chase: which gap, who owns it, and the task to create. */
type GapChase = {
  /** Stable key for the gap — the dedup + undo identity, stored in detail. */
  key: string;
  companyId: number;
  personId: number | null;
  /** Manager/owner the task should sit with, when known (person gaps). */
  ownerId: number | null;
  /** Task category (HR for people, Admin/Legal for companies). */
  category: string;
  priority: "Critical" | "High" | "Medium";
  /** The task action item line. */
  title: string;
  /** One-line "why" for the feed + audit trail. */
  reason: string;
  /** Human summary for the automation_events row. */
  summary: string;
};

/* ------------------------------------------------------------------ */
/* Baseline — forward-only, shared with the time sweep (read-only here */
/* so we never race it on first-init; if absent we treat "now" as the */
/* baseline, which still freezes out the existing backlog).            */
/* ------------------------------------------------------------------ */
async function getBaseline(): Promise<Date> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", BASELINE_KEY).maybeSingle();
    const existing = data?.value as string | null;
    if (existing) return new Date(existing);
  } catch { /* fall through */ }
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/* ------------------------------------------------------------------ */
/* Task creation + logging (mirror automation-time.ts's helpers)       */
/* ------------------------------------------------------------------ */
async function companyPrefix(companyId: number): Promise<string> {
  const { data } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  return (data?.code_prefix as string | null) || (data?.code as string | null) || "";
}

/** Create + audit the chase task. Shared by the Auto path and Apply. */
async function createChaseTask(c: Pick<GapChase, "companyId" | "ownerId" | "category" | "priority" | "title">): Promise<{ taskId: number; code: string }> {
  const now = new Date();
  const prefix = await companyPrefix(c.companyId);
  const task = await insertTaskWithUniqueCodeSb(c.companyId, prefix, {
    actionItem: c.title,
    ownerId: c.ownerId ?? null,
    status: "Not Started",
    priority: c.priority,
    category: c.category,
    deadline: null,
    createdDate: now,
    lastUpdatedAt: now,
    archived: false,
  });
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: c.companyId, entry_type: "CREATE", field: "Task",
    old_value: null, new_value: c.title, change_reason: "Created by automation — chasing a missing record",
    created_at: now.toISOString(), created_by: "automation",
  });
  return { taskId: task.id, code: task.code };
}

async function logChase(c: GapChase, task: { taskId: number; code: string }): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("automation_events").insert({
    kind: "task-create", status: "applied",
    document_id: null, target_table: "tasks", target_id: task.taskId,
    person_id: c.personId, company_id: c.companyId,
    summary: `Created chase task ${task.code} — ${c.summary}`,
    detail: `gap:${c.key}| ${c.reason}`,
    prev_value: null, new_value: task.code,
    created_at: now, acted_at: now, created_by: "automation",
  });
}

async function suggestChase(c: GapChase): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("automation_events").insert({
    kind: "task-create", status: "suggested",
    // The task doesn't exist yet — remember the company (and person) so Apply can
    // create it. target_table "companies" is OUR self-contained source; the gap
    // spec travels in `detail` (gap:<key>|…) + summary, read back on Apply.
    document_id: null, target_table: "companies", target_id: c.companyId,
    person_id: c.personId, company_id: c.companyId,
    summary: `Create chase task — ${c.summary}`,
    detail: `gap:${c.key}|${c.ownerId ?? ""}|${c.category}|${c.priority}|${c.title}`,
    prev_value: null, new_value: null,
    created_at: now, acted_at: null, created_by: "automation",
  });
}

/** Already proposed / created / undone for this gap? Dedup across ALL statuses,
 *  keyed by the gap id in the event detail — so a gap never double-spawns and an
 *  undone chase isn't re-created (same rule as the time sweeps). */
async function alreadyChased(key: string): Promise<boolean> {
  try {
    const { data } = await sb
      .from("automation_events")
      .select("id")
      .eq("kind", "task-create")
      .ilike("detail", `gap:${key}|%`)
      .limit(1);
    return !!(data && data.length);
  } catch {
    return true; // on error, err on the side of NOT creating a duplicate
  }
}

/* ------------------------------------------------------------------ */
/* Gap discovery — three independent sources, each best-effort.        */
/* ------------------------------------------------------------------ */

/** People missing a mandatory document (the worst-scoring compliance gaps). One
 *  chase per person (their top missing item), owned by their manager when known. */
async function personDocGaps(): Promise<GapChase[]> {
  const out: GapChase[] = [];
  try {
    const scores = await buildPersonRequirementScores();
    const worst = worstComplianceScores(scores, 30); // worst-first, Risk/Watch only
    // Resolve manager + company for the people we'll chase (one round trip).
    const ids = worst.map((s) => s.ownerId);
    const mgrByPerson = new Map<number, { companyId: number | null; managerId: number | null }>();
    if (ids.length) {
      const { data } = await sb.from("people").select("id,company_id,manager_id").in("id", ids);
      for (const p of data ?? []) {
        mgrByPerson.set(p.id as number, { companyId: (p.company_id as number | null) ?? null, managerId: (p.manager_id as number | null) ?? null });
      }
    }
    for (const s of worst) {
      const who = mgrByPerson.get(s.ownerId);
      if (!who?.companyId) continue; // tasks are company-owned
      // Only chase a genuine HOLE — a missing or expired mandatory document.
      // Items merely awaiting the verification tick (received/requested) aren't a
      // gap the staff member can act on, so skip people who are only in-progress.
      if (s.missing <= 0 && s.expired <= 0) continue;
      // Chase the single most pressing missing mandatory item: an EXPIRED critical
      // doc first (re-prove it), else a genuinely absent one.
      const top = topGap(s.gaps);
      if (!top) continue;
      const expired = s.expired > 0;
      out.push({
        key: `person-doc:${s.ownerId}:${slug(top.label)}`,
        companyId: who.companyId,
        personId: s.ownerId,
        ownerId: who.managerId,
        category: "HR",
        priority: expired ? "High" : "Medium",
        title: `Chase ${top.label.toLowerCase()} from ${s.ownerName}`,
        reason: `${s.ownerName} is missing a mandatory document — ${top.label}${expired ? " (an expired item needs re-proving)" : ""}.`,
        summary: `${s.ownerName} — ${top.label} outstanding`,
      });
    }
  } catch (e) {
    await recordEvent("automation.gaps", "error", { step: "person-docs", message: e instanceof Error ? e.message : String(e) });
  }
  return out;
}

/** Companies missing a mandatory statutory record (worst-scoring), e.g. a company
 *  with directors on file but no TIN. One chase per company (top missing item). */
async function companyDocGaps(): Promise<GapChase[]> {
  const out: GapChase[] = [];
  try {
    const { data: cos } = await sb.from("companies").select("id,name").eq("active", true);
    const companies = (cos ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    if (companies.length === 0) return out;
    const scores = await buildCompanyRequirementScores(companies);
    const worst = worstComplianceScores(scores, 30);
    for (const s of worst) {
      // Only a genuine hole — a missing or expired statutory record — not items
      // already on file awaiting the verification tick.
      if (s.missing <= 0 && s.expired <= 0) continue;
      const top = topGap(s.gaps);
      if (!top) continue;
      const expired = s.expired > 0;
      out.push({
        key: `company-doc:${s.ownerId}:${slug(top.label)}`,
        companyId: s.ownerId,
        personId: null,
        ownerId: null,
        category: "Legal",
        priority: expired ? "High" : "Medium",
        title: `Obtain ${top.label} for ${s.ownerName}`,
        reason: `${s.ownerName} is missing a mandatory statutory record — ${top.label}${expired ? " (and an item on file has expired)" : ""}.`,
        summary: `${s.ownerName} — ${top.label} missing`,
      });
    }
  } catch (e) {
    await recordEvent("automation.gaps", "error", { step: "company-docs", message: e instanceof Error ? e.message : String(e) });
  }
  return out;
}

/** Data-integrity holes from the Safety Net that a task can resolve. We chase the
 *  clear "go and record something" kind — a company missing its core identifiers
 *  (TIN / registration no.). Expiry/awaiting-original holes are already surfaced
 *  and acted on by the time sweep + document brain, so we don't double up. */
async function safetyGaps(): Promise<GapChase[]> {
  const out: GapChase[] = [];
  try {
    const findings = await gatherSafetyFindings();
    for (const f of findings) {
      // missing-company-id findings carry the company id in their stable id:
      // "missing-company-id:<id>".
      if (f.kind !== "missing-company-id") continue;
      const m = /^missing-company-id:(\d+)$/.exec(f.id);
      if (!m) continue;
      const companyId = Number(m[1]);
      out.push({
        key: `safety:${f.id}`,
        companyId,
        personId: null,
        ownerId: null,
        category: "Admin",
        priority: "Medium",
        title: f.title, // already "<Company> is missing TIN & registration no."
        reason: f.detail,
        summary: f.title,
      });
    }
  } catch (e) {
    await recordEvent("automation.gaps", "error", { step: "safety", message: e instanceof Error ? e.message : String(e) });
  }
  return out;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** The single gap to chase, chosen DETERMINISTICALLY (mandatory-only, then by
 *  label) so the dedup key (which embeds slug(top.label)) is STABLE across runs
 *  regardless of the DB row order behind s.gaps — otherwise a flipped "top" gap
 *  could spawn a second chase for the same owner. Returns null when none. */
function topGap(gaps: ComplianceGap[]): ComplianceGap | null {
  const mandatory = gaps.filter((g) => g.weight > 0);
  if (mandatory.length === 0) return null;
  return [...mandatory].sort((a, b) => a.label.localeCompare(b.label))[0];
}

/* ------------------------------------------------------------------ */
/* Entry point.                                                         */
/* ------------------------------------------------------------------ */
/** Find the top material record gaps and propose a chase task for each (auto =
 *  create now; suggest = one-click later). Forward-only, deduped, capped, logged,
 *  undoable. Returns how many chases were created vs suggested. Never throws. */
export async function runGapChasing(): Promise<{ created: number; suggested: number }> {
  let created = 0;
  let suggested = 0;
  try {
    const mode = await getAutomationMode("task-create");
    if (mode === "off") return { created, suggested };
    const suggesting = mode === "suggest";
    const baseline = await getBaseline(); // forward-only: don't dump the backlog

    // Forward-only without a dateable trigger: a "gap" has no timestamp to compare
    // against the baseline, so instead the VERY FIRST run for a given baseline only
    // arms (no-ops, records a marker); every run thereafter chases. This freezes
    // out the existing pile of gaps on enablement — the same "only going forward"
    // intent as the time sweep's baseline, applied to an undateable trigger.
    const armed = await armedSinceBaseline(baseline);
    if (!armed) {
      await recordEvent("automation.gaps", "ok", { created: 0, suggested: 0, reason: "armed-baseline" });
      return { created, suggested };
    }

    // Gather from all three sources, then rank: companies first (statutory holes
    // are highest-leverage), then people, then safety identifiers — and cap.
    const [companyGaps, peopleGaps, safety] = await Promise.all([
      companyDocGaps(),
      personDocGaps(),
      safetyGaps(),
    ]);
    const all = [...companyGaps, ...peopleGaps, ...safety];

    let acted = 0;
    for (const c of all) {
      if (acted >= MAX_PER_RUN) break;
      if (!c.companyId) continue;
      if (await alreadyChased(c.key)) continue; // dedup across all statuses
      try {
        if (suggesting) {
          await suggestChase(c);
          suggested++;
        } else {
          const task = await createChaseTask(c);
          await logChase(c, task);
          created++;
        }
        acted++;
      } catch (e) {
        await recordEvent("automation.gaps", "error", { step: "create", key: c.key, message: e instanceof Error ? e.message : String(e) });
      }
    }

    await recordEvent("automation.gaps", "ok", { created, suggested, considered: all.length });
  } catch (e) {
    await recordEvent("automation.gaps", "error", { step: "run", message: e instanceof Error ? e.message : String(e) });
  }
  return { created, suggested };
}

/** Forward-only arming: the first run on/after a fresh baseline only sets a marker
 *  (and chases nothing), so enabling the feature never dumps the whole backlog.
 *  Every run thereafter is armed. Keyed off the baseline value so resetting the
 *  baseline re-arms cleanly. Best-effort — on any error we treat as armed=false
 *  (safer: chase nothing) rather than risk a flood. */
const ARMED_KEY = "automation.gaps.armedFor";
async function armedSinceBaseline(baseline: Date): Promise<boolean> {
  try {
    const stamp = baseline.toISOString();
    const { data } = await sb.from("settings").select("value").eq("key", ARMED_KEY).maybeSingle();
    const armedFor = data?.value as string | null;
    if (armedFor === stamp) return true; // already armed for this baseline
    await sb.from("settings").upsert({ key: ARMED_KEY, value: stamp }, { onConflict: "key" });
    return false; // first run for this baseline: arm only, chase next time
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Apply a SUGGESTED gap chase — create the task now from its remembered */
/* spec (carried in the event detail). Wired into applyAutomationSuggestion */
/* for kind "task-create" + target_table "companies".                   */
/* ------------------------------------------------------------------ */
/** Recognise a gap-chase suggestion (vs a time-sweep renewal/notice/probation). */
export function isGapChaseRow(row: { target_table: string; detail: string | null }): boolean {
  return row.target_table === "companies" && !!row.detail && row.detail.startsWith("gap:");
}

/** Create the chase task from a suggested gap-chase event. The spec is encoded in
 *  detail as `gap:<key>|<ownerId>|<category>|<priority>|<title>`. */
export async function createGapChaseFromSuggestion(row: {
  target_id: number; person_id?: number | null; company_id?: number | null; detail: string | null; summary: string;
}): Promise<{ taskId: number; code: string }> {
  const companyId = (row.company_id ?? row.target_id) as number;
  if (!companyId) throw new Error("That gap is no longer available.");
  const detail = row.detail ?? "";
  // gap:<key>|<ownerId>|<category>|<priority>|<title>
  const parts = detail.split("|");
  const ownerRaw = parts[1] ?? "";
  const ownerId = ownerRaw ? Number(ownerRaw) : null;
  const category = parts[2] || "Admin";
  const priorityRaw = parts[3] || "Medium";
  const priority = (["Critical", "High", "Medium", "Low"].includes(priorityRaw) ? priorityRaw : "Medium") as "Critical" | "High" | "Medium";
  // Title is everything after the 4th pipe (may itself contain no pipes).
  const title = parts.slice(4).join("|").trim() || row.summary.replace(/^Create chase task — /, "");
  return createChaseTask({
    companyId,
    ownerId: ownerId && !Number.isNaN(ownerId) ? ownerId : null,
    category,
    priority,
    title,
  });
}
