// Daily morning digest — a "here's your day" to the owner: today's events, your
// reminders, overdue + due-today tasks, and documents to renew. Returns nothing to
// send when the day is genuinely empty (so we never send a blank email).

import type { CategoryDef, RunContext } from "../runtime";
import type { EmailDoc } from "@/lib/email/layout";
import { appBaseUrl } from "@/lib/app-url";

/** Compose the owner's digest. null = nothing worth reporting today. */
async function buildMorningDigest(ctx: RunContext): Promise<{ subject: string; text: string; doc: EmailDoc } | null> {
  const now = ctx.now;
  const [{ isOpen }, { listDocuments }, { isReminderDueToday }, { ownerReminderTodosDueBy }, { listCalendarEvents }] =
    await Promise.all([
      import("@/lib/derive"),
      import("@/lib/documents"),
      import("@/lib/documents-shared"),
      import("@/lib/todo-reminders"),
      import("@/lib/calendar"),
    ]);

  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const tomorrow = new Date(start); tomorrow.setDate(start.getDate() + 1);
  const TZ = "Africa/Nairobi";
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

  const [rows, docs, dueReminders, events] = await Promise.all([
    ctx.tasks(),
    listDocuments(),
    ownerReminderTodosDueBy(end),
    listCalendarEvents({ from: start.toISOString(), to: tomorrow.toISOString() }),
  ]);
  const overdue = rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now");
  const dueToday = rows.filter((r) => isOpen(r.status) && r.deadline && r.deadline >= start && r.deadline <= end);
  const renewals = docs.filter((d) => !d.archived && isReminderDueToday(d));

  const sections: string[] = [];
  const blocks: EmailDoc["blocks"] = [];
  const addSection = (label: string, bullets: string[]) => {
    sections.push(`${label} (${bullets.length}):\n${bullets.map((b) => `• ${b}`).join("\n")}`);
    blocks.push({ kind: "list", label: `${label} (${bullets.length})`, bullets });
  };
  if (events.length) addSection("Today's events", events.slice(0, 10).map((e) => `${fmtTime(e.startAt)} — ${e.title}`));
  if (dueReminders.length) addSection("Your reminders", dueReminders.slice(0, 10).map((r) => `${fmtTime(r.remindAt)} — ${r.title}`));
  if (overdue.length) addSection("Overdue tasks", overdue.slice(0, 10).map((t) => `${t.actionItem} (${t.code})`));
  if (dueToday.length) addSection("Due today", dueToday.slice(0, 10).map((t) => `${t.actionItem} (${t.code})`));
  if (renewals.length) addSection("Documents to renew", renewals.slice(0, 10).map((d) => d.title));

  if (sections.length === 0) return null;
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const dateShort = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
  return {
    subject: `Your day — ${dateShort}`,
    text: `Good morning. Here's your day — ${dateLabel}.\n\n${sections.join("\n\n")}\n\nOpen Oracle Consultancy for the full picture.`,
    doc: {
      preheader: `Your day — ${dateLabel}.`,
      dateLabel: dateShort,
      title: "Good morning",
      subtitle: `Here's your day — ${dateLabel}`,
      blocks,
      cta: { label: "Open Oracle Consultancy", url: `${appBaseUrl()}/` },
      footerNote: "You're receiving this because the daily morning digest is on. Manage in Settings → Email automation.",
      office: "admin",
    },
  };
}

export const morningDigestCategory: CategoryDef = {
  key: "morningDigest",
  scheduledToday: () => true, // daily
  async run(ctx) {
    const built = await buildMorningDigest(ctx);
    if (!built) return { prepared: 0, sent: 0, skipped: 0 };
    const r = await ctx.sendToOwner(built.subject, built.text, "automation-morning", { doc: built.doc });
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
