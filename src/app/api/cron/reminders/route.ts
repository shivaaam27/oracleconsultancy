import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { configurePush, sendToRecipient } from "@/lib/push";
import { dueTodoRemindersForPush, markTodosPushed } from "@/lib/todo-reminders";

export const dynamic = "force-dynamic";

/** Push every "remind me" whose moment has passed. Idempotent (each is marked
 *  pushed), so the 15-minute tick AND the daily cron can both call it. */
export async function runTodoReminders(): Promise<{ sent: number; due: number }> {
    if (!configurePush()) return { sent: 0, due: 0 };
    const due = await dueTodoRemindersForPush();
    if (due.length === 0) return { sent: 0, due: 0 };

    let sent = 0;
    const pushedIds: number[] = [];
    for (const r of due) {
      // Staff personal to-dos (kind 'self') ping the staff member; everything
      // else (owner to-dos, even if tagged to a person) pings the owner.
      const staff = r.kind === "self" && r.personId != null;
      const recipient = staff ? `person:${r.personId}` : "admin";
      // A reminder raised from a note opens THAT note. Owner-only by definition —
      // notes never reach the portal — so a staff reminder can never land here.
      const url = staff ? "/portal" : r.noteId != null ? `/notes/${r.noteId}` : "/";
      const n = await sendToRecipient(recipient, {
        title: "Reminder",
        body: r.title,
        url,
        tag: `cos-reminder-${r.id}`,
      });
      sent += n;
      // Mark pushed regardless of whether a device was reached — we don't want to
      // re-fire the same reminder every 15 min for someone with no push device;
      // it still shows in their "Your day" list + the morning digest.
      pushedIds.push(r.id);
    }
    await markTodosPushed(pushedIds);
    return { sent, due: due.length };
}

// Fires the timed push for ad-hoc "remind me" items whose moment has passed.
// Vercel runs this once a day (the Hobby plan allows no finer); the 15-minute
// /api/cron/tick heartbeat also calls runTodoReminders, which is what makes an
// 11:00 reminder arrive at 11:00 rather than at 10:00 the next day (push audit,
// 25 Sept 2026). Owner items push to "admin"; staff items to "person:<id>".
export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    if (!configurePush()) {
      await recordEvent("cron.reminders", "ok", { skipped: "push-not-configured" });
      return NextResponse.json({ ok: true, skipped: "push-not-configured" });
    }
    const { sent, due } = await runTodoReminders();
    await recordEvent("cron.reminders", "ok", { sent, due });
    return NextResponse.json({ ok: true, sent, due });
  } catch (err) {
    await reportError(err, { route: "cron.reminders" });
    await recordEvent("cron.reminders", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Reminders run failed." }, { status: 500 });
  }
}
