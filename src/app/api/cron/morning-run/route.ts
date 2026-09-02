import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { sendToRecipient, configurePush, flushRoutineDigests } from "@/lib/push";
import { purgeOldRead, purgeSupersededRecurring } from "@/lib/notifications";
import { runTimeAutomations } from "@/lib/automation-time";
import { buildMorningBrief } from "@/lib/morning-brief";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// One ordered morning job (Phase 3): chase the dates FIRST (so the day's work
// exists), then compose + send a single three-band brief. Replaces the separate
// notify + automations cron pushes, so the owner wakes to one summary, not several.
const SIG_KEY = "morningRun.lastSignature";
// Per-EAT-week guard for the weekly health & cost digest (stores the Monday's
// YYYY-MM-DD so a same-day re-run of the cron never sends it twice).
const HEALTH_KEY = "morningRun.lastHealthDigest";

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

    // 1a½. Advance meeting-tasks whose start has passed (Not Started → In Progress).
    try {
      const { advanceDueMeetingTasks, postMeetingFollowups } = await import("@/lib/meeting-tasks");
      await advanceDueMeetingTasks({ force: true });
      await postMeetingFollowups({ force: true });
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "meeting-tasks", message: e instanceof Error ? e.message : String(e) });
    }

    // 1a + 1b DISABLED (Jul 2026, owner request): the system no longer works on
    //   documents overnight on its own. Gap-chasing (proposing tasks/records from
    //   spotted gaps) and document self-heal (re-reading + re-owning mis-read scans)
    //   are OFF — they were the "acts by itself" jobs the owner wanted stopped.
    //   Expiry stays fully visible + manually actionable on the Documents page
    //   (Needs-attention bands, Renew/Chase/Notice). Renewal reminders (step 1,
    //   runTimeAutomations) and the health watchdog (step 1c) remain. To restore,
    //   re-enable the two blocks below.
    const gaps = { created: 0, suggested: 0 };
    // try { const { runGapChasing } = await import("@/lib/automation-gaps"); gaps = await runGapChasing(); }
    // catch (e) { await recordEvent("cron.morning", "error", { step: "gaps", message: e instanceof Error ? e.message : String(e) }); }
    // try { const { selfHealDocuments } = await import("@/app/documents/actions"); await selfHealDocuments(20); }
    // catch (e) { await recordEvent("cron.morning", "error", { step: "selfheal", message: e instanceof Error ? e.message : String(e) }); }

    // 1c. Watchdog + SELF-REPAIR: check every scheduled job + the AI reader. Pass
    //     repair:true so any job that failed or went stale gets ONE re-run attempt
    //     here BEFORE it's reported — a transient stall self-heals and the owner
    //     never sees red. We only log a "system.health" alert for what's STILL
    //     unhealthy after the repair pass; jobs that self-repaired are logged as a
    //     calm "system.repaired" note instead. In-app only — no email.
    try {
      const { checkSystemHealth } = await import("@/lib/system-health");
      const health = await checkSystemHealth({ repair: true });
      const repaired = health.jobs.filter((j) => j.repaired);
      if (repaired.length) {
        await recordEvent("system.repaired", "ok", { jobs: repaired.map((j) => j.label) });
      }
      if (health.status !== "ok") {
        const bad = health.jobs.filter((j) => j.state !== "healthy");
        await recordEvent("system.health", "error", {
          status: health.status,
          schedulerStale: health.schedulerStale,
          down: bad.map((j) => `${j.label}: ${j.state}`),
          autoRepaired: repaired.map((j) => j.label),
        });
      } else if (repaired.length) {
        // All green AFTER a self-repair — worth a calm positive note in the feed so
        // the owner can see the system looked after itself overnight. When nothing
        // needed fixing we stay quiet (the live card already shows the green state),
        // so the feed isn't spammed with a daily "all fine" row.
        await recordEvent("system.health", "ok", {
          healthy: `${health.summary.healthyJobs}/${health.summary.totalJobs}`,
          repaired: `${repaired.length} job${repaired.length === 1 ? "" : "s"}`,
          itemsIndexed: health.summary.itemsIndexed,
        });
      }
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "health", message: e instanceof Error ? e.message : String(e) });
    }

    // 1d. Model-deprecation watch: flag any configured Groq model that Groq no
    //     longer serves (vision is the known risk) so it surfaces BEFORE document
    //     scanning silently breaks. Best-effort, in-app only.
    try {
      const { checkModelAvailability } = await import("@/lib/model-watch");
      await checkModelAvailability();
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "model-watch", message: e instanceof Error ? e.message : String(e) });
    }

    // 1e. Flush any routine notifications held back overnight by quiet hours /
    //     the digest setting into one "while you were away" summary push. This is
    //     the SCHEDULED job that actually runs in vercel.json, so the digest must
    //     drain here — otherwise enabling it would silently lose every routine
    //     device buzz (the in-app bell still has the rows). Best-effort; held back
    //     again if we're still inside the quiet-hours window.
    let digest: Awaited<ReturnType<typeof flushRoutineDigests>> = { recipients: 0, pushed: 0 };
    try {
      digest = await flushRoutineDigests();
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "digest", message: e instanceof Error ? e.message : String(e) });
    }

    // 1f. Tidy the bell: drop notifications already READ and older than the
    //     retention window. Nothing ever expired them before, so half of every
    //     bell was over a fortnight old. Unread rows are always kept.
    try {
      const purged = await purgeOldRead();
      // Recurring items keep only their newest copy — today's reminder/digest
      // replaces yesterday's rather than stacking.
      const superseded = await purgeSupersededRecurring();
      if (purged > 0 || superseded > 0) {
        await recordEvent("cron.morning", "ok", { step: "notifications-purge", purged, superseded });
      }
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "notifications-purge", message: e instanceof Error ? e.message : String(e) });
    }

    // 1f. Weekly system health & cost digest (Mondays, Dar-time). Composed from
    //     what the app can READ about itself (AI usage, index size, open-task/doc
    //     counts, Trash) — NOT true Supabase egress, which only the dashboard sees.
    //     Owner-only, in-app + push. Best-effort: a failure here never breaks the
    //     morning run. Gated on a per-EAT-week signature so a re-run same Monday
    //     doesn't send twice.
    try {
      const eatDate = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
      const eatWeekday = new Date(`${eatDate}T12:00:00+03:00`).getDay(); // 0=Sun … 1=Mon
      // Owner gate (fail-open: any read error → enabled = today's behaviour).
      let healthEnabled = true;
      try { healthEnabled = (await getAppSettings()).signalHealthDigestEnabled; } catch { /* fail-open */ }
      if (eatWeekday === 1 && healthEnabled) {
        const { data: last } = await sb.from("settings").select("value").eq("key", HEALTH_KEY).maybeSingle();
        if ((last?.value as string | null) !== eatDate) {
          const { composeHealthDigest } = await import("@/lib/ori/health-digest");
          const hd = await composeHealthDigest();
          await recordEvent("cron.health-digest", "ok", { line: hd.line, ...hd.stats });
          if (configurePush()) {
            await sendToRecipient("admin", { title: hd.title, body: hd.line, url: "/insights", tag: "cos-health-digest" });
          }
          await sb.from("settings").upsert({ key: HEALTH_KEY, value: eatDate }, { onConflict: "key" });
        }
      }
    } catch (e) {
      await recordEvent("cron.morning", "error", { step: "health-digest", message: e instanceof Error ? e.message : String(e) });
    }

    // 2. Compose the three-band brief from the freshly-updated state.
    const brief = await buildMorningBrief();

    // 3. One notification — deep-link to the cockpit when there's something to act
    //    on, else the administrator. Skip entirely when there's nothing to say.
    if (brief.empty) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "nothing-to-say", work, gaps, digest });
      return NextResponse.json({ ok: true, sent: 0, work, gaps, digest });
    }

    if (!configurePush()) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "push-not-configured", work, gaps, brief: brief.line, digest });
      return NextResponse.json({ ok: true, sent: 0, reason: "push-not-configured", work, gaps, digest });
    }

    // De-dupe: only push when the picture changed from the last run.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const signature = `${today.toISOString().slice(0, 10)}|${brief.doneOvernight}|${brief.waiting}|${brief.urgent.total}`;
    const { data: last } = await sb.from("settings").select("value").eq("key", SIG_KEY).maybeSingle();
    if ((last?.value as string | null) === signature) {
      await recordEvent("cron.morning", "ok", { sent: 0, reason: "unchanged", work, gaps, digest });
      return NextResponse.json({ ok: true, sent: 0, reason: "unchanged", work, gaps, digest });
    }

    const url = brief.urgent.total > 0 ? "/?tab=tasks&flag=overdue" : brief.waiting > 0 ? "/approvals" : "/";
    // Owner-only: the morning brief is operational, never sent to staff devices.
    const sent = await sendToRecipient("admin", {
      title: "Good morning — your overnight run is done",
      body: brief.line,
      url,
      tag: "cos-morning",
    });

    await sb.from("settings").upsert({ key: SIG_KEY, value: signature }, { onConflict: "key" });
    await recordEvent("cron.morning", "ok", { sent, work, gaps, signature, digest });
    return NextResponse.json({ ok: true, sent, work, gaps, digest });
  } catch (err) {
    await reportError(err, { route: "cron.morning" });
    await recordEvent("cron.morning", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Morning run failed." }, { status: 500 });
  }
}
