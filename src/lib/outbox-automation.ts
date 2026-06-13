// Read-only snapshot of the email-automation engine for the Outbox "Automation"
// panel. The engine itself lives in `lib/email-automation.ts` and runs on a cron
// (/api/cron/email); this just surfaces, in plain language, what it's set to do
// and what it has actually sent — so the Outbox is the one place the owner can
// see automated outbound, not just the manual chase list.

import { sb } from "@/db/supabase";
import { getAutomationConfig, type EmailCategory, type RuleMode } from "@/lib/email-automation";
import { CATEGORY_LABELS, labelForSource } from "@/lib/outbox-automation-shared";

export { CATEGORY_LABELS, labelForSource };

export type AutomationCategoryState = {
  category: EmailCategory;
  label: string;
  mode: RuleMode;
  lastRun: string | null; // EAT date key "YYYY-MM-DD" or null
};

export type RecentAutoSend = {
  id: number;
  recipientName: string | null;
  recipientContact: string | null;
  subject: string | null;
  source: string | null;
  sourceLabel: string | null;
  sentAt: string | null;
};

export type AutomationSnapshot = {
  paused: boolean;
  windowStartHour: number;
  windowEndHour: number;
  dailyCap: number;
  /** Categories that are switched on (mode !== "off"). */
  liveCategories: AutomationCategoryState[];
  /** True when nothing at all is switched on (and not paused). */
  allOff: boolean;
  /** Auto-sent automation emails in the last 7 days, newest first. */
  recentSends: RecentAutoSend[];
};

export async function getAutomationSnapshot(): Promise<AutomationSnapshot> {
  const cfg = await getAutomationConfig();

  const categories = Object.keys(cfg.categories) as EmailCategory[];
  // Pull every per-category last-run stamp in one query.
  const lastRunKeys = categories.map((c) => `email.automation.lastRun.${c}`);
  const { data: runRows } = await sb
    .from("settings")
    .select("key,value")
    .in("key", lastRunKeys);
  const lastRunByCat = new Map<string, string>();
  for (const r of runRows ?? []) {
    const cat = (r.key as string).replace("email.automation.lastRun.", "");
    lastRunByCat.set(cat, r.value as string);
  }

  const liveCategories: AutomationCategoryState[] = categories
    .filter((c) => cfg.categories[c].mode !== "off")
    .map((c) => ({
      category: c,
      label: CATEGORY_LABELS[c],
      mode: cfg.categories[c].mode,
      lastRun: lastRunByCat.get(c) ?? null,
    }));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: sendRows } = await sb
    .from("outbox")
    .select("id,recipient_name,recipient_contact,subject,source,sent_at")
    .eq("message_type", "AUTOMATION")
    .eq("status", "Sent")
    .gte("sent_at", sevenDaysAgo)
    .order("sent_at", { ascending: false })
    .limit(20);

  const recentSends: RecentAutoSend[] = (sendRows ?? []).map((r: any) => ({
    id: r.id,
    recipientName: r.recipient_name,
    recipientContact: r.recipient_contact,
    subject: r.subject,
    source: r.source,
    sourceLabel: labelForSource(r.source),
    sentAt: r.sent_at,
  }));

  return {
    paused: cfg.paused,
    windowStartHour: cfg.windowStartHour,
    windowEndHour: cfg.windowEndHour,
    dailyCap: cfg.dailyCap,
    liveCategories,
    allOff: liveCategories.length === 0,
    recentSends,
  };
}
