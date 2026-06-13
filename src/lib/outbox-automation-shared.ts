// Client-safe labels for automation categories/sources. Kept separate from
// `outbox-automation.ts` (which pulls server-only db code) so client components
// — e.g. the Drafts list — can import the pure label helpers without bundling
// server code.

import type { EmailCategory } from "@/lib/email-automation";

/** Human labels + one-line meaning for each automation category. */
export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  overdue: "Overdue-task reminders",
  renewals: "Document & permit renewals",
  directorBrief: "Weekly Director Brief",
  lifecycle: "Probation & leave reminders",
  birthdays: "Birthday greetings",
  statutory: "Statutory deadlines",
  meetingFollowup: "Meeting follow-ups",
  custom: "Custom rules",
};

/** "automation-renewals" → "Document & permit renewals", etc. */
const SOURCE_TO_CATEGORY: Record<string, EmailCategory> = {
  "automation-renewals": "renewals",
  "automation-brief": "directorBrief",
  "automation-lifecycle": "lifecycle",
  "automation-overdue": "overdue",
};

export function labelForSource(source: string | null): string | null {
  if (!source) return null;
  const cat = SOURCE_TO_CATEGORY[source];
  if (cat) return CATEGORY_LABELS[cat];
  if (source.startsWith("automation")) return "Automation";
  return null;
}
