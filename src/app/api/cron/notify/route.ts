import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sendToRecipient, configurePush } from "@/lib/push";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { isReminderDueToday } from "@/lib/documents-shared";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { listApprovals } from "@/lib/cockpit";

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

    // Documents: expired, or inside their per-document reminder window.
    const documents = await listDocuments();
    const docsExpired = documents.filter((d) => deriveDocStatus(d) === "Expired");
    // Tiered cadence (transfer-pack 02 §4): documents whose days-to-expiry lands
    // on a reminder tier TODAY (immigration 120/90/30/5 + past expiry; others
    // 30/10). These are the ones actively "due for a nudge" right now.
    const remindersDue = documents.filter((d) => !d.archived && isReminderDueToday(d));
    // "Expiring" = in the lead window but NOT already counted as a reminder-due
    // today, so the push line doesn't double-count the same documents.
    const remindersSet = new Set(remindersDue.map((d) => d.id));
    const docsExpiring = documents.filter((d) => deriveDocStatus(d) === "Expiring" && !remindersSet.has(d.id));

    // Compliance gaps: missing or expired MANDATORY requirements across people and
    // companies. Catches requirement review-date lapses + missing docs that aren't
    // visible as document rows. (expired counts the verified-but-lapsed items too.)
    const { data: companyRows } = await sb.from("companies").select("id,name");
    const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    const [personScores, companyScores] = await Promise.all([
      buildPersonRequirementScores(),
      buildCompanyRequirementScores(companies),
    ]);
    const complianceGaps = [...personScores, ...companyScores].reduce(
      (sum, s) => sum + s.missing + s.expired,
      0
    );

    // Safety-net data-quality issues (high/medium only — low items are FYI and
    // shouldn't ping the owner daily).
    const findings = await gatherSafetyFindings();
    const dataIssues = findings.filter((f) => f.severity !== "low").length;

    // Cockpit: things the self-running system has queued for the owner's one-tap
    // approval (record + process proposals). The "while you were away" line.
    const approvalsWaiting = (await listApprovals()).length;

    const parts: string[] = [];
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    if (escalated.length) parts.push(`${escalated.length} escalated`);
    if (dueToday.length) parts.push(`${dueToday.length} due today`);
    if (docsExpired.length) parts.push(`${docsExpired.length} doc${docsExpired.length === 1 ? "" : "s"} expired`);
    if (docsExpiring.length) parts.push(`${docsExpiring.length} doc${docsExpiring.length === 1 ? "" : "s"} expiring`);
    if (remindersDue.length) parts.push(`${remindersDue.length} renewal reminder${remindersDue.length === 1 ? "" : "s"} due`);
    if (complianceGaps) parts.push(`${complianceGaps} compliance gap${complianceGaps === 1 ? "" : "s"}`);
    if (dataIssues) parts.push(`${dataIssues} data issue${dataIssues === 1 ? "" : "s"}`);
    if (approvalsWaiting) parts.push(`${approvalsWaiting} waiting for approval`);

    // Nothing actionable — don't notify.
    if (parts.length === 0) {
      await recordEvent("cron.notify", "ok", { sent: 0, reason: "nothing-actionable" });
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // De-dupe: only push when the situation changes from the last run.
    const signature = `${todayStart.toISOString().slice(0, 10)}|${overdue.length}|${escalated.length}|${dueToday.length}|${docsExpired.length}|${docsExpiring.length}|${remindersDue.length}|${complianceGaps}|${dataIssues}|${approvalsWaiting}`;
    const { data: last } = await sb.from("settings").select("value").eq("key", SIG_KEY).maybeSingle();
    if ((last?.value as string | null) === signature) {
      await recordEvent("cron.notify", "ok", { sent: 0, reason: "unchanged" });
      return NextResponse.json({ ok: true, sent: 0, reason: "unchanged" });
    }

    // Deep-link to the most relevant surface: tasks if any are urgent, else
    // documents if those are the issue, else the approvals cockpit.
    const noTasks = overdue.length === 0 && escalated.length === 0 && dueToday.length === 0;
    const noDocs = docsExpired.length === 0 && docsExpiring.length === 0 && remindersDue.length === 0;
    const url = !noTasks
      ? "/?tab=tasks&flag=overdue"
      : !noDocs
      ? "/documents"
      : approvalsWaiting
      ? "/approvals"
      : "/documents";
    // Owner-only: this is an operations alert, never broadcast to staff devices.
    const sent = await sendToRecipient("admin", {
      title: "Oracle Consultancy — needs attention",
      body: parts.join(" · "),
      url,
      tag: "cos-attention",
    });

    await sb.from("settings").upsert({ key: SIG_KEY, value: signature }, { onConflict: "key" });
    await recordEvent("cron.notify", "ok", { sent, signature });
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    await reportError(err, { route: "cron.notify" });
    await recordEvent("cron.notify", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Notify run failed." }, { status: 500 });
  }
}
