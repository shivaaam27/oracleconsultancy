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

const fmtDue = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : null;
const statusDot = (t: TaskRow) => (isOverdue(t) ? "🔴" : isDueToday(t) || t.priority === "High" || t.priority === "Medium" ? "🟠" : "⚪");

/**
 * Build BOTH surfaces for a reminder:
 *  • `chat`  — the full, tidy in-chat message (grouped by company, status dots,
 *    due dates, a clear call-to-action). Chat shows plain text, so no markdown.
 *  • `push`  — a SHORT one-glance hook (counts + CTA) so the OS notification never
 *    truncates mid-sentence on Android/iOS.
 */
function buildReminder(name: string, allTasks: TaskRow[], urgentOnly: boolean) {
  const first = getGivenName(name);
  const overdue = allTasks.filter(isOverdue).length;
  const dueToday = allTasks.filter(isDueToday).length;
  // Urgent slots focus on overdue/due-today; the morning slot shows everything.
  const tasks = urgentOnly ? allTasks.filter(isUrgent) : allTasks;

  // ── chat body ──────────────────────────────────────────────────────────────
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) (groups.get(t.companyName) ?? groups.set(t.companyName, []).get(t.companyName)!).push(t);
  for (const list of groups.values())
    list.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));

  const head = urgentOnly
    ? `Hi ${first} — a quick nudge on what needs attention${overdue ? ` (${overdue} overdue${dueToday ? `, ${dueToday} due today` : ""})` : dueToday ? ` (${dueToday} due today)` : ""}:`
    : `Hi ${first}, here's where things stand — ${allTasks.length} open task${allTasks.length === 1 ? "" : "s"}${overdue ? `, ${overdue} overdue` : ""}:`;
  const lines: string[] = [head, ""];
  for (const [company, list] of groups) {
    lines.push(company);
    for (const t of list) {
      const due = fmtDue(t.deadline);
      const tail = isOverdue(t) ? "overdue" : isDueToday(t) ? "due today" : due ? `due ${due}` : t.status;
      lines.push(`${statusDot(t)} ${t.actionItem} · ${tail}`);
    }
    lines.push("");
  }
  lines.push(`👉 Open & update your tasks: ${appBaseUrl()}/portal`);
  const chat = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // ── push (short) ─────────────────────────────────────────────────────────
  const urgentParts: string[] = [];
  if (overdue) urgentParts.push(`${overdue} overdue`);
  if (dueToday) urgentParts.push(`${dueToday} due today`);
  const push = urgentOnly
    ? {
        title: "⚠️ Tasks need attention",
        body: `Hi ${first} — ${urgentParts.join(", ") || "a few items to chase"}. Tap to catch up →`,
      }
    : {
        title: "Your tasks · Oracle Consultancy",
        body: `Hi ${first} — ${allTasks.length} open${overdue ? `, ${overdue} overdue` : ""}. Tap to review →`,
      };

  return { chat, push };
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
      const { chat, push } = buildReminder(d.recipientName, d.tasks, urgentOnly);
      await postSystemMessage({
        personId: d.personId,
        kind: "reminders",
        title: "Task reminders",
        body: chat,
        push,
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
