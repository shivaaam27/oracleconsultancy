// The single source of truth for how each automation category PRESENTS itself:
// its label, the plain-language description shown in Settings, the "natural" mode
// it switches into, the schedule, and the `outbox.source` string it stamps on the
// rows it creates. Everything else (Settings UI, the Outbox snapshot panel, the
// Drafts list) derives from here — add a category in ONE place and it appears
// everywhere, labelled consistently.
//
// Client-safe: imports only types. No server code.

import type { EmailCategory } from "./types";

export type CategorySchedule = "daily" | "weekly" | "monthly";

export type CategoryMeta = {
  key: EmailCategory;
  label: string;
  /** Shown in Settings under the toggle when the category is ON. */
  onDescription: string;
  /** The mode a category switches into when the owner turns it on. Outward-facing
   *  nudges PREPARE a draft to approve; the owner's own internal emails AUTO-send. */
  naturalMode: "prepare" | "auto";
  /** The `outbox.source` value rows from this category carry (for the sent log). */
  source: string;
  schedule: CategorySchedule;
};

/** Ordered — drives the order categories appear in Settings + the snapshot panel. */
export const CATEGORY_META: CategoryMeta[] = [
  {
    key: "taskReminders",
    label: "Task reminders to staff",
    onDescription: "Emails each person their open tasks (overdue flagged) on Mon, Wed & Fri.",
    naturalMode: "auto",
    source: "automation-taskreminders",
    schedule: "weekly",
  },
  {
    key: "overdue",
    label: "Overdue-task safety net",
    onDescription: "A daily catch for anyone still overdue (in addition to the Mon/Wed/Fri reminder).",
    naturalMode: "auto",
    source: "automation-overdue",
    schedule: "daily",
  },
  {
    key: "renewals",
    label: "Document & permit renewals",
    onDescription: "Sends you a daily digest of documents that are expiring or expired.",
    naturalMode: "auto",
    source: "automation-renewals",
    schedule: "daily",
  },
  {
    key: "directorBrief",
    label: "Weekly Director Brief (to you)",
    onDescription: "Auto-sends the portfolio brief to your inbox each week.",
    naturalMode: "auto",
    source: "automation-brief",
    schedule: "weekly",
  },
  {
    key: "morningDigest",
    label: "Daily morning digest (to you)",
    onDescription: "Auto-sends a 'here's your day' each morning — events, reminders, overdue & due tasks, renewals.",
    naturalMode: "auto",
    source: "automation-morning",
    schedule: "daily",
  },
  {
    key: "lifecycle",
    label: "Probation & leave reminders (to you)",
    onDescription: "Auto-sends a daily HR summary — probations ending and leave to approve.",
    naturalMode: "auto",
    source: "automation-lifecycle",
    schedule: "daily",
  },
  {
    key: "boardPack",
    label: "Monthly board pack (to you)",
    onDescription: "On the 1st of each month, emails you the board pack PDF to forward to the director & CFO.",
    naturalMode: "auto",
    source: "automation-boardpack",
    schedule: "monthly",
  },
];

const META_BY_KEY: Record<EmailCategory, CategoryMeta> = Object.fromEntries(
  CATEGORY_META.map((m) => [m.key, m]),
) as Record<EmailCategory, CategoryMeta>;

export function categoryMeta(key: EmailCategory): CategoryMeta {
  return META_BY_KEY[key];
}

/** Human label per category, derived from the meta list. */
export const CATEGORY_LABELS: Record<EmailCategory, string> = Object.fromEntries(
  CATEGORY_META.map((m) => [m.key, m.label]),
) as Record<EmailCategory, string>;

/** The mode a category switches into when toggled on. */
export const NATURAL_MODE: Record<EmailCategory, "prepare" | "auto"> = Object.fromEntries(
  CATEGORY_META.map((m) => [m.key, m.naturalMode]),
) as Record<EmailCategory, "prepare" | "auto">;

const SOURCE_TO_CATEGORY: Record<string, EmailCategory> = Object.fromEntries(
  CATEGORY_META.map((m) => [m.source, m.key]),
);

/** "automation-renewals" → "Document & permit renewals", etc. */
export function labelForSource(source: string | null): string | null {
  if (!source) return null;
  const cat = SOURCE_TO_CATEGORY[source];
  if (cat) return CATEGORY_LABELS[cat];
  if (source.startsWith("automation")) return "Automation";
  return null;
}
