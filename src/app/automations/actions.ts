"use server";

import { guardOwner } from "@/lib/viewer";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin-auth";
// Every action that CHANGES something checks for the owner itself (audit 24
// Sept 2026). The read-only lists do not: the morning brief and the notify cron
// build the cockpit from them, and a cron has no owner session.
import { sb } from "@/db/supabase";
import { getAutomationMode } from "@/lib/automation-reactions";
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

/** What the automation layer has done + what it's suggesting. Degrades to empty
 *  if the table isn't there yet (pre-migration), so the feed never breaks. */
export async function listAutomationFeed(): Promise<{ applied: AutomationFeedItem[]; suggestions: AutomationFeedItem[] }> {
  await guardOwner();
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

export type AutomationRuleStatus = { kind: string; mode: AutomationMode; applied: number; suggested: number };

/** Per-rule mode + lifetime activity counts, for the Settings control room. */
export async function getAutomationRuleStatuses(): Promise<AutomationRuleStatus[]> {
  await guardOwner();
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

/** Set a rule's mode (Auto / Suggest / Off). */
export async function setAutomationModeAction(kind: string, mode: AutomationMode): Promise<{ ok: boolean }> {
  await guardOwner();
  if (!(await isAdminSession())) throw new Error("Not signed in.");
  if (!["auto", "suggest", "off"].includes(mode)) return { ok: false };
  if (!AUTOMATION_RULES.some((r) => r.kind === kind && !r.retired)) return { ok: false };
  const before = await getAutomationMode(kind as Parameters<typeof getAutomationMode>[0]);
  const { error } = await sb.from("settings").upsert({ key: `automation.mode.${kind}`, value: mode }, { onConflict: "key" });
  if (error) return { ok: false };
  // Switching task-create back ON starts it from today. Its "only going forward"
  // date was fixed when it first ran, so turning it on after months off created
  // a task for everything that fell due while it was off (audit 24 Sept 2026).
  if (kind === "task-create" && before === "off" && mode !== "off") {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    await sb.from("settings").upsert({ key: "automation.time.baseline", value: midnight.toISOString() }, { onConflict: "key" });
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
