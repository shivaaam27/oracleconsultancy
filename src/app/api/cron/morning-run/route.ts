import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { sendToAll, configurePush } from "@/lib/push";
import { runTimeAutomations } from "@/lib/automation-time";
import { buildMorningBrief } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";

// One ordered morning job (Phase 3): chase the dates FIRST (so the day's work
// exists), then compose + send a single three-band brief. Replaces the separate
// notify + automations cron pushes, so the owner wakes to one summary, not several.
const SIG_KEY = "morningRun.lastSignature";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    // 1. Chase the dates — create/suggest renewals, notices, probation reviews.
    let work = { renewals: 0, commitments: 0, probations: 0 };
    try {
      work = await runTimeAutomations();
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "automations", message: e instanceof Error ? e.message : String(e) });
    }

    // 2. Compose the three-band brief from the freshly-updated state.
    const brief = await buildMorningBrief();

    // 3. One notification — deep-link to the cockpit when there's something to act
    //    on, else the command centre. Skip entirely when there's nothing to say.
    if (brief.empty) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "nothing-to-say", work });
      return NextResponse.json({ ok: true, sent: 0, work });
    }

    if (!configurePush()) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "push-not-configured", work, brief: brief.line });
      return NextResponse.json({ ok: true, sent: 0, reason: "push-not-configured", work });
    }

    // De-dupe: only push when the picture changed from the last run.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const signature = `${today.toISOString().slice(0, 10)}|${brief.doneOvernight}|${brief.waiting}|${brief.urgent.total}`;
    const { data: last } = await sb.from("settings").select("value").eq("key", SIG_KEY).maybeSingle();
    if ((last?.value as string | null) === signature) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "unchanged", work });
      return NextResponse.json({ ok: true, sent: 0, reason: "unchanged", work });
    }

    const url = brief.urgent.total > 0 ? "/?tab=tasks&flag=overdue" : brief.waiting > 0 ? "/approvals" : "/";
    const res = await sendToAll({
      title: "Good morning — your overnight run is done",
      body: brief.line,
      url,
      tag: "cos-morning",
    });

    await sb.from("settings").upsert({ key: SIG_KEY, value: signature }, { onConflict: "key" });
    await recordEvent("cron.morning", "ok", { sent: res.sent, pruned: res.pruned, work, signature });
    return NextResponse.json({ ok: true, ...res, work });
  } catch (err) {
    await reportError(err, { route: "cron.morning" });
    await recordEvent("cron.morning", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Morning run failed." }, { status: 500 });
  }
}
