// Daily morning digest — a "here's your day" to the owner: today's events, your
// reminders, overdue + due-today tasks, and documents to renew. Returns nothing to
// send when the day is genuinely empty (so we never send a blank email).

import type { CategoryDef, RunContext } from "../runtime";

/** Compose the owner's digest. null = nothing worth reporting today. */
async function buildMorningDigest(ctx: RunContext): Promise<{ subject: string; text: string } | null> {
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
  if (events.length) sections.push(`Today's events (${events.length}):\n${events.slice(0, 10).map((e) => `• ${fmtTime(e.startAt)} — ${e.title}`).join("\n")}`);
  if (dueReminders.length) sections.push(`Your reminders (${dueReminders.length}):\n${dueReminders.slice(0, 10).map((r) => `• ${fmtTime(r.remindAt)} — ${r.title}`).join("\n")}`);
  if (overdue.length) sections.push(`Overdue tasks (${overdue.length}):\n${overdue.slice(0, 10).map((t) => `• ${t.actionItem} (${t.code})`).join("\n")}`);
  if (dueToday.length) sections.push(`Due today (${dueToday.length}):\n${dueToday.slice(0, 10).map((t) => `• ${t.actionItem} (${t.code})`).join("\n")}`);
  if (renewals.length) sections.push(`Documents to renew (${renewals.length}):\n${renewals.slice(0, 10).map((d) => `• ${d.title}`).join("\n")}`);

  if (sections.length === 0) return null;
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return {
    subject: `Your day — ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })}`,
    text: `Good morning. Here's your day — ${dateLabel}.\n\n${sections.join("\n\n")}\n\nOpen Oracle Consultancy for the full picture.`,
  };
}

export const morningDigestCategory: CategoryDef = {
  key: "morningDigest",
  scheduledToday: () => true, // daily
  async run(ctx) {
    const built = await buildMorningDigest(ctx);
    if (!built) return { prepared: 0, sent: 0, skipped: 0 };
    const r = await ctx.sendToOwner(built.subject, built.text, "automation-morning");
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
