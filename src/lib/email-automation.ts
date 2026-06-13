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
  /** Weekday (0=Sun..6=Sat, EAT) the weekly Director Brief auto-sends. Default Mon. */
  briefDay: number;
  categories: Record<EmailCategory, CategoryRule>;
};

const DEFAULTS: AutomationConfig = {
  paused: false,
  windowStartHour: 8,
  windowEndHour: 18,
  dailyCap: 50,
  briefDay: 1, // Monday
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
function eatWeekday(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCDay();
}

/**
 * Auto-send an internal email to the owner (their own mailbox = the configured
 * from-address). Falls back to an Outbox draft if email isn't connected, so
 * nothing is lost. Records a Sent/Draft row for visibility.
 */
async function sendOrDraftToOwner(
  subject: string,
  text: string,
  source: string
): Promise<{ sent: number; prepared: number }> {
  const { getEmailConfig } = await import("@/lib/settings");
  const cfg = await getEmailConfig();
  const to = cfg?.fromAddress ?? null;
  if (cfg && to) {
    const { sendEmail } = await import("@/lib/email");
    const res = await sendEmail({ to, subject, text });
    if (res.ok) {
      await sb.from("outbox").insert({
        channel: "EMAIL", recipient_name: cfg.fromName || "Owner", recipient_contact: to,
        subject, body: text, message_type: "AUTOMATION", status: "Sent",
        source, created_at: new Date().toISOString(),
      });
      return { sent: 1, prepared: 0 };
    }
  }
  // Not configured or send failed → leave a draft.
  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: "Owner", recipient_contact: to,
    subject, body: text, message_type: "AUTOMATION", status: "Draft",
    source, created_at: new Date().toISOString(),
  });
  return { sent: 0, prepared: 1 };
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

  // --- Document/permit renewal nudges (PREPARE) ---
  const renewals = cfg.categories.renewals;
  if (renewals.mode !== "off" && !(await alreadyRanToday("renewals"))) {
    const { listDocuments } = await import("@/lib/documents");
    const { getDocumentRenewalCandidates } = await import("@/lib/automation-suggestions");
    const { draftDocumentRenewalAction } = await import("@/app/documents/actions");
    const docs = await listDocuments();
    const candidates = await getDocumentRenewalCandidates(docs);
    let prepared = 0;
    for (const c of candidates) {
      const r = await draftDocumentRenewalAction(c.document.id); // de-duped per doc per day
      if (r.ok && r.created) prepared++;
    }
    await markRanToday("renewals");
    results.push({ category: "renewals", mode: renewals.mode, prepared, sent: 0, skipped: candidates.length - prepared });
    await recordEvent("email.automation.renewals", "ok", { prepared, candidates: candidates.length });
  }

  // --- Weekly Director Brief to the owner (AUTO-SEND, on the chosen weekday) ---
  const brief = cfg.categories.directorBrief;
  if (brief.mode !== "off" && eatWeekday(now) === cfg.briefDay && !(await alreadyRanToday("directorBrief"))) {
    const { getBrief, briefEmail } = await import("@/lib/director-brief");
    const data = await getBrief(now, "month", null);
    const email = briefEmail(data);
    const r = await sendOrDraftToOwner(email.subject, email.body, "automation-brief");
    await markRanToday("directorBrief");
    results.push({ category: "directorBrief", mode: brief.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
    await recordEvent("email.automation.directorBrief", "ok", { sent: r.sent, prepared: r.prepared });
  }

  // --- Probation + leave-approval reminders to the owner (AUTO-SEND) ---
  const lifecycle = cfg.categories.lifecycle;
  if (lifecycle.mode !== "off" && !(await alreadyRanToday("lifecycle"))) {
    const { getBrief } = await import("@/lib/director-brief");
    const data = await getBrief(now, "month", null);
    const hr = data.hr;
    const lines: string[] = [];
    for (const p of hr.probationEnding.slice(0, 12))
      lines.push(`• Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${new Date(p.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
    for (const l of hr.pendingLeave.slice(0, 12))
      lines.push(`• Leave to approve: ${l.name} — ${l.type}, ${l.days} day${l.days === 1 ? "" : "s"} (${l.start} → ${l.end})`);
    if (lines.length > 0) {
      const text = `HR reminders — as at ${data.asAt}\n\n${lines.join("\n")}\n\nReview in the HR area when you can.`;
      const r = await sendOrDraftToOwner("HR reminders — probation & leave", text, "automation-lifecycle");
      await markRanToday("lifecycle");
      results.push({ category: "lifecycle", mode: lifecycle.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
      await recordEvent("email.automation.lifecycle", "ok", { sent: r.sent, prepared: r.prepared, items: lines.length });
    } else {
      await markRanToday("lifecycle");
    }
  }

  return { ran: results.length > 0, categories: results };
}
