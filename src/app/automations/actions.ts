"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { performAutomationMove, undoAutomationMove, getAutomationMode } from "@/lib/automation-reactions";
import { runTimeAutomations, createTaskFromSuggestion } from "@/lib/automation-time";
import { AUTOMATION_RULES, type AutomationMode } from "@/lib/automation-rules";

export type AutomationFeedItem = {
  id: number;
  kind: string;
  status: string;
  summary: string;
  detail: string | null;
  prevValue: string | null;
  newValue: string | null;
  createdAt: string;
};

type Row = {
  id: number; kind: string; status: string; target_table: string; target_id: number;
  summary: string; detail: string | null; prev_value: string | null; new_value: string | null; created_at: string;
};

const toItem = (r: Row): AutomationFeedItem => ({
  id: r.id, kind: r.kind, status: r.status, summary: r.summary, detail: r.detail,
  prevValue: r.prev_value, newValue: r.new_value, createdAt: r.created_at,
});
const toMoveRow = (r: Row) => ({ kind: r.kind, targetTable: r.target_table, targetId: r.target_id, newValue: r.new_value, prevValue: r.prev_value, summary: r.summary });

/** What the automation layer has done + what it's suggesting. Degrades to empty
 *  if the table isn't there yet (pre-migration), so the feed never breaks. */
export async function listAutomationFeed(): Promise<{ applied: AutomationFeedItem[]; suggestions: AutomationFeedItem[] }> {
  try {
    const { data, error } = await sb
      .from("automation_events")
      .select("id,kind,status,target_table,target_id,summary,detail,prev_value,new_value,created_at")
      .in("status", ["applied", "suggested"])
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    return {
      applied: rows.filter((r) => r.status === "applied").slice(0, 20).map(toItem),
      suggestions: rows.filter((r) => r.status === "suggested").map(toItem),
    };
  } catch {
    return { applied: [], suggestions: [] };
  }
}

export type AutomationHistoryItem = AutomationFeedItem & { owner: string | null; actedAt: string | null };

/** Full automation log (every status), with owner names + optional filters — the
 *  Inbox card's "History" view. Degrades to [] pre-migration. */
export async function listAutomationHistory(opts: { kind?: string; status?: string; limit?: number } = {}): Promise<AutomationHistoryItem[]> {
  try {
    let q = sb
      .from("automation_events")
      .select("id,kind,status,target_table,target_id,summary,detail,prev_value,new_value,created_at,acted_at,person_id,company_id")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 120);
    if (opts.kind && opts.kind !== "all") q = q.eq("kind", opts.kind);
    if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Array<Row & { acted_at: string | null; person_id: number | null; company_id: number | null }>;
    const personIds = [...new Set(rows.map((r) => r.person_id).filter((x): x is number => !!x))];
    const companyIds = [...new Set(rows.map((r) => r.company_id).filter((x): x is number => !!x))];
    const [ppl, cos] = await Promise.all([
      personIds.length ? sb.from("people").select("id,name").in("id", personIds) : Promise.resolve({ data: [] as Array<{ id: number; name: string }> }),
      companyIds.length ? sb.from("companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [] as Array<{ id: number; name: string }> }),
    ]);
    const pName = new Map((ppl.data ?? []).map((p) => [p.id as number, p.name as string]));
    const cName = new Map((cos.data ?? []).map((c) => [c.id as number, c.name as string]));
    return rows.map((r) => ({
      ...toItem(r),
      owner: (r.person_id ? pName.get(r.person_id) : null) ?? (r.company_id ? cName.get(r.company_id) : null) ?? null,
      actedAt: r.acted_at,
    }));
  } catch {
    return [];
  }
}

function revalidateAll() {
  revalidatePath("/approvals");
  revalidatePath("/documents");
  revalidatePath("/hrms/pipeline");
  revalidatePath("/");
}

async function fetchRow(id: number, status: string): Promise<Row | null> {
  const { data } = await sb
    .from("automation_events")
    .select("id,kind,status,target_table,target_id,summary,detail,prev_value,new_value,created_at,document_id")
    .eq("id", id).eq("status", status).maybeSingle();
  return (data as (Row & { document_id: number | null }) | null) ?? null;
}

/** Apply a pending suggestion — performs the move and marks it applied. */
export async function applyAutomationSuggestion(id: number): Promise<{ ok: boolean; error?: string }> {
  const row = await fetchRow(id, "suggested");
  if (!row) return { ok: false, error: "Already handled." };
  try {
    if (row.kind === "task-create") {
      // The task doesn't exist yet — create it from the remembered source, then
      // repoint the event at the new task so Undo can archive it (a time-sweep
      // renewal/notice/probation created from its source row).
      const created = await createTaskFromSuggestion(row);
      await sb.from("automation_events").update({ status: "applied", acted_at: new Date().toISOString(), target_table: "tasks", target_id: created.taskId, new_value: created.code }).eq("id", id);
    } else if (row.kind === "pipeline-create") {
      // The application case doesn't exist yet — create it from the source document,
      // then repoint the event at the new case so Undo can archive it.
      const docId = (row as Row & { document_id: number | null }).document_id;
      if (!docId) return { ok: false, error: "Source document missing." };
      const { createPipelineFromDocument } = await import("@/lib/pipeline");
      const created = await createPipelineFromDocument(docId);
      if (!created.ok) return { ok: false, error: created.error };
      await sb.from("automation_events").update({ status: "applied", acted_at: new Date().toISOString(), target_table: "pipeline", target_id: created.id, new_value: created.stage }).eq("id", id);
    } else {
      await performAutomationMove(toMoveRow(row));
      await sb.from("automation_events").update({ status: "applied", acted_at: new Date().toISOString() }).eq("id", id);
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply." };
  }
}

/** Undo an applied action — reverses the move and marks it undone. */
export async function undoAutomationEvent(id: number): Promise<{ ok: boolean; error?: string }> {
  const row = await fetchRow(id, "applied");
  if (!row) return { ok: false, error: "Nothing to undo." };
  try {
    await undoAutomationMove(toMoveRow(row));
    await sb.from("automation_events").update({ status: "undone", acted_at: new Date().toISOString() }).eq("id", id);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not undo." };
  }
}

/** Dismiss a suggestion without acting on it. */
export async function dismissAutomationSuggestion(id: number): Promise<{ ok: boolean }> {
  await sb.from("automation_events").update({ status: "dismissed", acted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/approvals");
  return { ok: true };
}

export type AutomationRuleStatus = { kind: string; mode: AutomationMode; applied: number; suggested: number };

/** Per-rule mode + lifetime activity counts, for the Settings control room. */
export async function getAutomationRuleStatuses(): Promise<AutomationRuleStatus[]> {
  const counts = new Map<string, { applied: number; suggested: number }>();
  try {
    const { data } = await sb.from("automation_events").select("kind,status");
    for (const r of (data ?? []) as Array<{ kind: string; status: string }>) {
      const c = counts.get(r.kind) ?? { applied: 0, suggested: 0 };
      if (r.status === "applied") c.applied++;
      else if (r.status === "suggested") c.suggested++;
      counts.set(r.kind, c);
    }
  } catch { /* table may not exist yet */ }
  const out: AutomationRuleStatus[] = [];
  for (const rule of AUTOMATION_RULES) {
    const c = counts.get(rule.kind) ?? { applied: 0, suggested: 0 };
    out.push({ kind: rule.kind, mode: await getAutomationMode(rule.kind), applied: c.applied, suggested: c.suggested });
  }
  return out;
}

/** Phase 6: the minimum AI read-confidence (0–100%) for AUTO-filling records.
 *  0 = a clean read is enough (default). */
export async function getRecordsConfidence(): Promise<number> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "automation.records.confidence").maybeSingle();
    const n = parseInt((data?.value as string | null) ?? "", 10);
    if (!Number.isNaN(n)) return Math.min(100, Math.max(0, n));
  } catch { /* default */ }
  return 0;
}

export async function setRecordsConfidenceAction(pct: number): Promise<{ ok: boolean }> {
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  await sb.from("settings").upsert({ key: "automation.records.confidence", value: String(v) }, { onConflict: "key" });
  revalidatePath("/settings");
  return { ok: true };
}

/** Set a rule's mode (Auto / Suggest / Off). */
export async function setAutomationModeAction(kind: string, mode: AutomationMode): Promise<{ ok: boolean }> {
  if (!["auto", "suggest", "off"].includes(mode)) return { ok: false };
  if (!AUTOMATION_RULES.some((r) => r.kind === kind)) return { ok: false };
  await sb.from("settings").upsert({ key: `automation.mode.${kind}`, value: mode }, { onConflict: "key" });
  revalidatePath("/settings");
  revalidatePath("/approvals");
  return { ok: true };
}

/** Run the time-based automations on demand (the daily cron runs them too) —
 *  creates renewal/notice tasks for dates that have passed. Returns the counts. */
export async function runTimeAutomationsNow(): Promise<{ ok: boolean; renewals: number; commitments: number; probations: number }> {
  try {
    const res = await runTimeAutomations();
    revalidateAll();
    return { ok: true, ...res };
  } catch {
    return { ok: false, renewals: 0, commitments: 0, probations: 0 };
  }
}
