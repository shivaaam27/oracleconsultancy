import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sendToAll, configurePush } from "@/lib/push";

export const dynamic = "force-dynamic";

const SIG_KEY = "push.lastSignature";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    if (!configurePush()) {
      return NextResponse.json({ ok: true, skipped: "push-not-configured" });
    }

    const rows = await getAllTasks();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const overdue = rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now");
    const escalated = rows.filter((r) => isOpen(r.status) && (r.status === "Escalated" || r.escalation === "Yes"));
    const dueToday = rows.filter(
      (r) => isOpen(r.status) && r.deadline && r.deadline >= todayStart && r.deadline <= todayEnd
    );

    const parts: string[] = [];
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    if (escalated.length) parts.push(`${escalated.length} escalated`);
    if (dueToday.length) parts.push(`${dueToday.length} due today`);

    // Nothing actionable — don't notify.
    if (parts.length === 0) {
      await recordEvent("cron.notify", "ok", { sent: 0, reason: "nothing-actionable" });
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // De-dupe: only push when the situation changes from the last run.
    const signature = `${todayStart.toISOString().slice(0, 10)}|${overdue.length}|${escalated.length}|${dueToday.length}`;
    const { data: last } = await sb.from("settings").select("value").eq("key", SIG_KEY).maybeSingle();
    if ((last?.value as string | null) === signature) {
      await recordEvent("cron.notify", "ok", { sent: 0, reason: "unchanged" });
      return NextResponse.json({ ok: true, sent: 0, reason: "unchanged" });
    }

    const res = await sendToAll({
      title: "AUMIO — tasks need attention",
      body: parts.join(" · "),
      url: "/?tab=tasks&flag=overdue",
      tag: "cos-attention",
    });

    await sb.from("settings").upsert({ key: SIG_KEY, value: signature }, { onConflict: "key" });
    await recordEvent("cron.notify", "ok", { sent: res.sent, pruned: res.pruned, signature });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    await reportError(err, { route: "cron.notify" });
    await recordEvent("cron.notify", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Notify run failed." }, { status: 500 });
  }
}
