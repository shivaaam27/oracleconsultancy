// Shared automation types. Client-safe — NO server imports here, so client
// components (Settings forms, the Drafts list) can import these freely.

export type RuleMode = "off" | "prepare" | "auto";

/**
 * The set of email-automation categories that are actually implemented. Each one
 * has a definition in `registry.ts` and a presentation entry in `meta.ts`. Only
 * add a key here once it has both — that keeps the type, the engine and the UI in
 * lockstep (the old code drifted: the type listed 10, the engine ran 7, Settings
 * showed 5).
 */
export type EmailCategory =
  | "taskReminders" // each person's open tasks, overdue flagged (Mon/Wed/Fri)
  | "overdue"       // overdue-only daily safety-net + Outbox draft prep
  | "renewals"      // document / permit renewal nudges
  | "directorBrief" // weekly Director Brief to the owner
  | "morningDigest" // daily "here's your day" to the owner
  | "lifecycle"     // probation + leave-approval reminders to the owner
  | "boardPack";    // monthly board-pack reminder (director + CFO)

export type CategoryRule = { mode: RuleMode };

export type AutomationConfig = {
  /** Master pause — when true, nothing runs. */
  paused: boolean;
  /** Send window in EAT (UTC+3), 24h. Outside it, scheduled sends are held. */
  windowStartHour: number;
  windowEndHour: number;
  /** Max automated emails per day across all categories. */
  dailyCap: number;
  /** Don't re-nudge the same person within this many days (any channel). 0 = off. */
  cooldownDays: number;
  /** Weekday (0=Sun..6=Sat, EAT) the weekly Director Brief auto-sends. Default Mon. */
  briefDay: number;
  categories: Record<EmailCategory, CategoryRule>;
};

export type AutomationRunSummary = {
  ran: boolean;
  reason?: string;
  categories: Array<{ category: EmailCategory; mode: RuleMode; prepared: number; sent: number; skipped: number }>;
};
