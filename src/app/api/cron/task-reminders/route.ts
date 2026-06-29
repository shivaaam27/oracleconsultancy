import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { generateDrafts } from "@/lib/outbox/gen";
import { postSystemMessage } from "@/lib/chat";
import { getGivenName } from "@/lib/names";
import { appBaseUrl } from "@/lib/app-url";
import type { TaskRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Daily task reminders, delivered into each person's in-built "Task
 * reminders" chat thread (which also pushes to anyone with notifications
 * enabled). Scheduled at 09:00 / 14:00 / 19:00 EAT (= 06/11/16 UTC).
 *
 *   • Morning (≈09:00) → everyone with ANY open task.
 *   • Midday/evening   → only people with OVERDUE or DUE-TODAY work, so the
 *     extra pings stay useful and never nag people who are on track.
 *
 * Nothing is stored beyond the chat message itself — the open-task list is
 * computed live. Posting reuses the chat send pipeline, so notifications +
 * web-push are handled exactly like a normal message.
 * ------------------------------------------------------------------ */

const isOverdue = (t: TaskRow) => t.flag === "overdue" || t.flag === "escalate-now";
const isDueToday = (t: TaskRow) => t.daysToDeadline === 0;
const isUrgent = (t: TaskRow) => isOverdue(t) || isDueToday(t);

/** Short, plain-text reminder for the chat thread (chat doesn't render WhatsApp
 *  *markdown*, so keep it clean). Lists up to 6 tasks; links to the portal. */
function buildChatReminder(name: string, tasks: TaskRow[], urgentOnly: boolean): string {
  const first = getGivenName(name);
  const overdue = tasks.filter(isOverdue).length;
  const dueToday = tasks.filter(isDueToday).length;
  const shown = (urgentOnly ? tasks.filter(isUrgent) : tasks).slice(0, 6);

  const head = urgentOnly
    ? `Hi ${first} — ${overdue ? `${overdue} overdue` : ""}${overdue && dueToday ? " · " : ""}${dueToday ? `${dueToday} due today` : ""}. A quick nudge:`
    : `Hi ${first}, here are your ${tasks.length} open task${tasks.length === 1 ? "" : "s"}${overdue ? ` (${overdue} overdue)` : ""}:`;

  const lines = [head, ""];
  for (const t of shown) {
    const flag = isOverdue(t) ? " ⚠️ overdue" : isDueToday(t) ? " • due today" : "";
    lines.push(`• ${t.actionItem} — ${t.companyName}${flag}`);
  }
  const more = (urgentOnly ? tasks.filter(isUrgent).length : tasks.length) - shown.length;
  if (more > 0) lines.push(`…and ${more} more.`);
  lines.push("");
  lines.push(`Open your tasks → ${appBaseUrl()}/portal`);
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    // Slot from the wall clock (UTC). 06:00 UTC = 09:00 EAT = the morning "all
    // open tasks" run; the later slots (11/16 UTC) only chase urgent work. Any
    // hour before 09:00 EAT counts as the morning run (safe if a plan only fires
    // the job once/day — it then behaves as the daily 9am all-tasks reminder).
    const hourUtc = new Date().getUTCHours();
    const urgentOnly = hourUtc >= 9; // 11/16 UTC → urgent; 06 UTC → all

    const drafts = await generateDrafts();
    let posted = 0;
    let recipients = 0;
    for (const d of drafts) {
      if (d.personId == null || d.tasks.length === 0) continue;
      const relevant = urgentOnly ? d.tasks.some(isUrgent) : true;
      if (!relevant) continue;
      recipients++;
      const body = buildChatReminder(d.recipientName, d.tasks, urgentOnly);
      await postSystemMessage({
        personId: d.personId,
        kind: "reminders",
        title: "Task reminders",
        body,
      });
      posted++;
    }

    await recordEvent("cron.task-reminders", "ok", { slot: urgentOnly ? "urgent" : "all", recipients, posted });
    return NextResponse.json({ ok: true, slot: urgentOnly ? "urgent" : "all", posted });
  } catch (err) {
    reportError(err, { route: "cron/task-reminders" });
    await recordEvent("cron.task-reminders", "error", { message: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
