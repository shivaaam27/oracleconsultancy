import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { configurePush, sendToRecipient } from "@/lib/push";
import { dueTodoRemindersForPush, markTodosPushed } from "@/lib/todo-reminders";

export const dynamic = "force-dynamic";

// Fires the timed push for ad-hoc "remind me" items whose moment has passed.
// Runs every ~15 min. Owner items push to "admin"; staff items to "person:<id>".
export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    if (!configurePush()) return NextResponse.json({ ok: true, skipped: "push-not-configured" });

    const due = await dueTodoRemindersForPush();
    if (due.length === 0) {
      await recordEvent("cron.reminders", "ok", { sent: 0, due: 0 });
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sent = 0;
    const pushedIds: number[] = [];
    for (const r of due) {
      // Staff personal to-dos (kind 'self') ping the staff member; everything
      // else (owner to-dos, even if tagged to a person) pings the owner.
      const staff = r.kind === "self" && r.personId != null;
      const recipient = staff ? `person:${r.personId}` : "admin";
      const url = staff ? "/portal" : "/";
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

    await recordEvent("cron.reminders", "ok", { sent, due: due.length });
    return NextResponse.json({ ok: true, sent, due: due.length });
  } catch (err) {
    await reportError(err, { route: "cron.reminders" });
    await recordEvent("cron.reminders", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Reminders run failed." }, { status: 500 });
  }
}
