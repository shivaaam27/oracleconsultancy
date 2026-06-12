// Email-automation engine (Phase A). Config lives as a JSON blob in `settings`
// (key "email.automation") so the owner controls it without a schema change.
// The dispatcher cron (/api/cron/email) calls runDueAutomations(); each category
// either PREPARES Outbox drafts or AUTO-SENDS, behind a safety net. Phase A wires
// one category — overdue-task reminders — in PREPARE mode. See email_automation_plan.

import { sb } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";

export type RuleMode = "off" | "prepare" | "auto";
export type EmailCategory =
  | "overdue"      // overdue-task reminders
  | "renewals"     // document/permit renewal nudges
  | "directorBrief"// weekly Director Brief to the owner
  | "lifecycle"    // probation + leave-approval reminders
  | "birthdays"
  | "statutory"
  | "meetingFollowup"
  | "custom";

export type CategoryRule = { mode: RuleMode };

export type AutomationConfig = {
  /** Master pause — when true, nothing runs. */
  paused: boolean;
  /** Send window in EAT (UTC+3), 24h. Outside it, sends are held. */
  windowStartHour: number;
  windowEndHour: number;
  /** Max automated emails per day across all categories. */
  dailyCap: number;
  categories: Record<EmailCategory, CategoryRule>;
};

const DEFAULTS: AutomationConfig = {
  paused: false,
  windowStartHour: 8,
  windowEndHour: 18,
  dailyCap: 50,
  categories: {
    overdue: { mode: "off" },        // owner opts in (Phase A ships it as a switch)
    renewals: { mode: "off" },
    directorBrief: { mode: "off" },
    lifecycle: { mode: "off" },
    birthdays: { mode: "off" },
    statutory: { mode: "off" },
    meetingFollowup: { mode: "off" },
    custom: { mode: "off" },
  },
};

const CONFIG_KEY = "email.automation";

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const { data } = await sb.from("settings").select("value").eq("key", CONFIG_KEY).maybeSingle();
  if (!data?.value) return DEFAULTS;
  try {
    const saved = JSON.parse(data.value as string) as Partial<AutomationConfig>;
    return {
      ...DEFAULTS,
      ...saved,
      categories: { ...DEFAULTS.categories, ...(saved.categories ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export async function saveAutomationConfig(patch: Partial<AutomationConfig>): Promise<void> {
  const current = await getAutomationConfig();
  const next: AutomationConfig = {
    ...current,
    ...patch,
    categories: { ...current.categories, ...(patch.categories ?? {}) },
  };
  await sb.from("settings").upsert({ key: CONFIG_KEY, value: JSON.stringify(next) }, { onConflict: "key" });
}

/** EAT (UTC+3) hour right now. */
function eatHour(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCHours();
}
function eatDateKey(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function withinSendWindow(cfg: AutomationConfig, now = new Date()): boolean {
  const h = eatHour(now);
  return h >= cfg.windowStartHour && h < cfg.windowEndHour;
}

/** A category's daily run is de-duped via a per-category, per-day signature key. */
async function alreadyRanToday(category: EmailCategory): Promise<boolean> {
  const key = `email.automation.lastRun.${category}`;
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) === eatDateKey();
}
async function markRanToday(category: EmailCategory): Promise<void> {
  await sb.from("settings").upsert({ key: `email.automation.lastRun.${category}`, value: eatDateKey() }, { onConflict: "key" });
}

export type AutomationRunSummary = {
  ran: boolean;
  reason?: string;
  categories: Array<{ category: EmailCategory; mode: RuleMode; prepared: number; sent: number; skipped: number }>;
};

/**
 * Run every category that is enabled + due now. Phase A: overdue reminders in
 * PREPARE mode (reuses createOverdueReminderDrafts). Safe to call frequently —
 * each daily category runs at most once per EAT day.
 */
export async function runDueAutomations(now = new Date()): Promise<AutomationRunSummary> {
  const cfg = await getAutomationConfig();
  if (cfg.paused) return { ran: false, reason: "paused", categories: [] };
  if (!withinSendWindow(cfg, now)) return { ran: false, reason: "outside-send-window", categories: [] };

  const results: AutomationRunSummary["categories"] = [];

  // --- Overdue-task reminders (Phase A) ---
  const overdue = cfg.categories.overdue;
  if (overdue.mode !== "off" && !(await alreadyRanToday("overdue"))) {
    const { getAllTasks } = await import("@/lib/queries");
    const { createOverdueReminderDrafts } = await import("@/lib/automation-suggestions");
    const rows = await getAllTasks();
    // Phase A always PREPARES (drafts). Auto-send wiring lands in Phase B.
    const res = await createOverdueReminderDrafts(rows);
    await markRanToday("overdue");
    results.push({ category: "overdue", mode: overdue.mode, prepared: res.created, sent: 0, skipped: res.skipped });
    await recordEvent("email.automation.overdue", "ok", { prepared: res.created, skipped: res.skipped, mode: overdue.mode });
  }

  return { ran: results.length > 0, categories: results };
}
