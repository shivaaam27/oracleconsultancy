// Server-side runtime shared by every category: the EAT clock, the send-window +
// once-per-day guards, and the RunContext (memoised heavy data + the two send
// helpers). Categories stay small because all the plumbing lives here.

import { sb } from "@/db/supabase";
import type { AutomationConfig, EmailCategory, RuleMode } from "./types";
import type { TaskRow } from "@/lib/queries";
import type { BriefData } from "@/lib/director-brief";

/* --------------------------------- clock --------------------------------- */
/** EAT (UTC+3) hour right now. */
export function eatHour(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCHours();
}
export function eatDateKey(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
export function eatWeekday(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCDay();
}
export function eatDayOfMonth(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCDate();
}

export function withinSendWindow(cfg: AutomationConfig, now = new Date()): boolean {
  const h = eatHour(now);
  return h >= cfg.windowStartHour && h < cfg.windowEndHour;
}

/* ------------------------- once-per-day dedupe --------------------------- */
/** A category's daily run is de-duped via a per-category, per-day signature key. */
export async function alreadyRanToday(category: EmailCategory): Promise<boolean> {
  const key = `email.automation.lastRun.${category}`;
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) === eatDateKey();
}
export async function markRanToday(category: EmailCategory): Promise<void> {
  await sb.from("settings").upsert({ key: `email.automation.lastRun.${category}`, value: eatDateKey() }, { onConflict: "key" });
}

/* ------------------------------ run context ------------------------------ */
export type RunResult = { prepared: number; sent: number; skipped: number };

export type CategoryDef = {
  key: EmailCategory;
  /** True when today (EAT) is a scheduled day for this category, ignoring the
   *  once-per-day dedupe (the engine layers that on separately). */
  scheduledToday(cfg: AutomationConfig, now: Date): boolean;
  run(ctx: RunContext, mode: RuleMode): Promise<RunResult>;
};

export type RunContext = {
  cfg: AutomationConfig;
  now: Date;
  force: boolean;
  /** Memoised — several categories need these; load each at most once per run. */
  tasks(): Promise<TaskRow[]>;
  brief(): Promise<BriefData>;
  /**
   * Auto-send an email to the owner (their own mailbox = the configured from-
   * address). Falls back to an Outbox draft if email isn't connected, so nothing
   * is lost. Records a Sent/Draft row for visibility.
   */
  sendToOwner(
    subject: string,
    text: string,
    source: string,
    attachments?: EmailAttachmentLite[],
  ): Promise<{ sent: number; prepared: number }>;
  /** Auto-send to a specific person's email. Test mode (in sendEmail) redirects it. */
  sendToPerson(toEmail: string | null, subject: string, text: string): Promise<{ sent: number; skipped: number }>;
};

type EmailAttachmentLite = { filename: string; content: string; contentType?: string; encoding?: "utf8" | "base64" };

function lazy<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

export function makeContext(cfg: AutomationConfig, now: Date, force: boolean): RunContext {
  return {
    cfg,
    now,
    force,
    tasks: lazy(async () => {
      const { getAllTasks } = await import("@/lib/queries");
      return getAllTasks();
    }),
    brief: lazy(async () => {
      const { getBrief } = await import("@/lib/director-brief");
      return getBrief(now, "month", null);
    }),
    async sendToOwner(subject, text, source, attachments) {
      const { getEmailConfig } = await import("@/lib/settings");
      const cfg2 = await getEmailConfig();
      const to = cfg2?.fromAddress ?? null;
      if (cfg2 && to) {
        const { sendEmail } = await import("@/lib/email/send");
        const res = await sendEmail({ to, subject, text, attachments });
        if (res.ok) {
          await sb.from("outbox").insert({
            channel: "EMAIL", recipient_name: cfg2.fromName || "Owner", recipient_contact: to,
            subject, body: text, message_type: "AUTOMATION", status: "Sent",
            source, created_at: new Date().toISOString(),
          });
          return { sent: 1, prepared: 0 };
        }
      }
      // Not configured or send failed → leave a draft so it's never lost.
      await sb.from("outbox").insert({
        channel: "EMAIL", recipient_name: "Owner", recipient_contact: to,
        subject, body: text, message_type: "AUTOMATION", status: "Draft",
        source, created_at: new Date().toISOString(),
      });
      return { sent: 0, prepared: 1 };
    },
    async sendToPerson(toEmail, subject, text) {
      if (!toEmail) return { sent: 0, skipped: 1 };
      const { sendEmail } = await import("@/lib/email/send");
      const res = await sendEmail({ to: toEmail, subject, text });
      return res.ok ? { sent: 1, skipped: 0 } : { sent: 0, skipped: 1 };
    },
  };
}
