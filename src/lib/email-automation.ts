// Email-automation engine (Phase A). Config lives as a JSON blob in `settings`
// (key "email.automation") so the owner controls it without a schema change.
// The dispatcher cron (/api/cron/email) calls runDueAutomations(); each category
// either PREPARES Outbox drafts or AUTO-SENDS, behind a safety net. Phase A wires
// one category — overdue-task reminders — in PREPARE mode. See email_automation_plan.

import { sb } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";
import { appBaseUrl } from "@/lib/app-url";

export type RuleMode = "off" | "prepare" | "auto";
export type EmailCategory =
  | "overdue"      // overdue-task reminders
  | "renewals"     // document/permit renewal nudges
  | "directorBrief"// weekly Director Brief to the owner
  | "morningDigest"// daily "here's your day" to the owner
  | "lifecycle"    // probation + leave-approval reminders
  | "birthdays"
  | "statutory"
  | "meetingFollowup"
  | "boardPack"     // monthly board-pack reminder (director + CFO audience)
  | "custom";

export type CategoryRule = { mode: RuleMode };

export type AutomationConfig = {
  /** Master pause — when true, nothing runs. */
  paused: boolean;
  /** Send window in EAT (UTC+3), 24h. Outside it, sends are held. */
  windowStartHour: number;
  windowEndHour: number;
  /** Max automated emails per day across all categories. */
  dailyCap: number;
  /** Don't re-nudge the same person within this many days (any channel). 0 = off. */
  cooldownDays: number;
  /** Weekday (0=Sun..6=Sat, EAT) the weekly Director Brief auto-sends. Default Mon. */
  briefDay: number;
  categories: Record<EmailCategory, CategoryRule>;
};

const DEFAULTS: AutomationConfig = {
  paused: false,
  windowStartHour: 8,
  windowEndHour: 18,
  dailyCap: 50,
  cooldownDays: 2,
  briefDay: 1, // Monday
  categories: {
    overdue: { mode: "off" },        // owner opts in (Phase A ships it as a switch)
    renewals: { mode: "off" },
    directorBrief: { mode: "off" },
    morningDigest: { mode: "off" },
    lifecycle: { mode: "off" },
    birthdays: { mode: "off" },
    statutory: { mode: "off" },
    meetingFollowup: { mode: "off" },
    boardPack: { mode: "off" },
    custom: { mode: "off" },
  },
};

const CONFIG_KEY = "email.automation";

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const { data } = await sb.from("settings").select("value").eq("key", CONFIG_KEY).maybeSingle();
  if (!data?.value) return DEFAULTS;
  try {
    const saved = JSON.parse(data.value as string) as Partial<AutomationConfig>;
    return {
      ...DEFAULTS,
      ...saved,
      categories: { ...DEFAULTS.categories, ...(saved.categories ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export async function saveAutomationConfig(patch: Partial<AutomationConfig>): Promise<void> {
  const current = await getAutomationConfig();
  const next: AutomationConfig = {
    ...current,
    ...patch,
    categories: { ...current.categories, ...(patch.categories ?? {}) },
  };
  await sb.from("settings").upsert({ key: CONFIG_KEY, value: JSON.stringify(next) }, { onConflict: "key" });
}

/** EAT (UTC+3) hour right now. */
function eatHour(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCHours();
}
function eatDateKey(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function eatWeekday(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCDay();
}
function eatDayOfMonth(now = new Date()): number {
  return new Date(now.getTime() + 3 * 3600 * 1000).getUTCDate();
}
const appUrl = appBaseUrl;

/**
 * Auto-send an internal email to the owner (their own mailbox = the configured
 * from-address). Falls back to an Outbox draft if email isn't connected, so
 * nothing is lost. Records a Sent/Draft row for visibility.
 */
async function sendOrDraftToOwner(
  subject: string,
  text: string,
  source: string,
  attachments?: Array<{ filename: string; content: string; contentType?: string; encoding?: "utf8" | "base64" }>
): Promise<{ sent: number; prepared: number }> {
  const { getEmailConfig } = await import("@/lib/settings");
  const cfg = await getEmailConfig();
  const to = cfg?.fromAddress ?? null;
  if (cfg && to) {
    const { sendEmail } = await import("@/lib/email");
    const res = await sendEmail({ to, subject, text, attachments });
    if (res.ok) {
      await sb.from("outbox").insert({
        channel: "EMAIL", recipient_name: cfg.fromName || "Owner", recipient_contact: to,
        subject, body: text, message_type: "AUTOMATION", status: "Sent",
        source, created_at: new Date().toISOString(),
      });
      return { sent: 1, prepared: 0 };
    }
  }
  // Not configured or send failed → leave a draft.
  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: "Owner", recipient_contact: to,
    subject, body: text, message_type: "AUTOMATION", status: "Draft",
    source, created_at: new Date().toISOString(),
  });
  return { sent: 0, prepared: 1 };
}

export function withinSendWindow(cfg: AutomationConfig, now = new Date()): boolean {
  const h = eatHour(now);
  return h >= cfg.windowStartHour && h < cfg.windowEndHour;
}

/** A category's daily run is de-duped via a per-category, per-day signature key. */
async function alreadyRanToday(category: EmailCategory): Promise<boolean> {
  const key = `email.automation.lastRun.${category}`;
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) === eatDateKey();
}
async function markRanToday(category: EmailCategory): Promise<void> {
  await sb.from("settings").upsert({ key: `email.automation.lastRun.${category}`, value: eatDateKey() }, { onConflict: "key" });
}

export type AutomationRunSummary = {
  ran: boolean;
  reason?: string;
  categories: Array<{ category: EmailCategory; mode: RuleMode; prepared: number; sent: number; skipped: number }>;
};

/** Auto-send to a specific person's email (test mode redirects to the owner). */
async function sendToPerson(toEmail: string | null, subject: string, text: string): Promise<{ sent: number; skipped: number }> {
  if (!toEmail) return { sent: 0, skipped: 1 };
  const { sendEmail } = await import("@/lib/email");
  const res = await sendEmail({ to: toEmail, subject, text });
  return res.ok ? { sent: 1, skipped: 0 } : { sent: 0, skipped: 1 };
}

/** Compose the owner's "here's your day" digest. Returns null when there's
 *  genuinely nothing to report (so we never send an empty email). */
async function buildMorningDigest(now: Date): Promise<{ subject: string; text: string } | null> {
  const [{ getAllTasks }, { isOpen }, { listDocuments }, { isReminderDueToday }, { ownerReminderTodosDueBy }, { listCalendarEvents }] =
    await Promise.all([
      import("@/lib/queries"),
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
    getAllTasks(),
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

/**
 * Run every category that is enabled + due now. Each daily category runs at most
 * once per EAT day. Categories in "prepare" mode create Outbox drafts; "auto"
 * mode sends email (redirected to the owner while Test mode is on).
 */
export async function runDueAutomations(now = new Date(), opts: { force?: boolean } = {}): Promise<AutomationRunSummary> {
  const force = opts.force === true; // manual "run now" — ignore window + daily dedupe
  const cfg = await getAutomationConfig();
  if (cfg.paused) return { ran: false, reason: "paused", categories: [] };
  if (!force && !withinSendWindow(cfg, now)) return { ran: false, reason: "outside-send-window", categories: [] };

  const results: AutomationRunSummary["categories"] = [];

  // --- Overdue-task reminders (Phase A) ---
  const overdue = cfg.categories.overdue;
  if (overdue.mode !== "off" && (force || !(await alreadyRanToday("overdue")))) {
    const { getAllTasks } = await import("@/lib/queries");
    const rows = await getAllTasks();
    let prepared = 0, sent = 0, skipped = 0;
    if (overdue.mode === "auto") {
      // Email each person their overdue list (test mode → redirected to owner).
      const { getOverdueReminderCandidates } = await import("@/lib/automation-suggestions");
      const { lastChasedByName } = await import("@/lib/outbox-history");
      const cands = getOverdueReminderCandidates(rows);
      const byPerson = new Map<number, typeof cands>();
      for (const t of cands) for (const pid of t.assigneeIds) { const l = byPerson.get(pid) ?? []; l.push(t); byPerson.set(pid, l); }
      const ids = [...byPerson.keys()];
      const { data: ppl } = ids.length ? await sb.from("people").select("id,name,email").in("id", ids) : { data: [] as any[] };
      const emailById = new Map((ppl ?? []).map((p: any) => [p.id as number, { name: p.name as string, email: (p.email as string | null) ?? null }]));
      // Cooldown: don't re-email anyone chased (any channel) within the window —
      // otherwise a daily auto-run nags the same person every morning.
      const chased = cfg.cooldownDays > 0 ? await lastChasedByName() : {};
      const chasedRecently = (name: string): boolean => {
        if (cfg.cooldownDays <= 0) return false;
        const lc = chased[name.trim().toLowerCase()];
        return !!lc && Date.now() - new Date(lc.sentAt).getTime() < cfg.cooldownDays * 86_400_000;
      };
      // Enforce the daily cap the Outbox advertises ("cap N/day"). Without this it
      // was unbounded — a switch to auto-send (or a forced run) could mass-email.
      let budget = cfg.dailyCap;
      for (const [pid, tasks] of byPerson) {
        const person = emailById.get(pid);
        if (!person) { skipped++; continue; }
        if (chasedRecently(person.name)) { skipped++; continue; }
        if (budget <= 0) { skipped++; continue; }
        const body = `Hi ${person.name.split(" ")[0]}, a reminder of your overdue work:\n\n${tasks.map((t) => `• ${t.actionItem} (${t.code})`).join("\n")}\n\nPlease update the tracker when you can. Thank you.`;
        const r = await sendToPerson(person.email, "Your overdue tasks", body);
        sent += r.sent; skipped += r.skipped;
        budget -= r.sent;
        // Log the auto-send so it appears in the Outbox sent log and feeds the
        // "chased Nd ago" hint + cooldown on the next run.
        if (r.sent > 0) {
          const iso = new Date().toISOString();
          await sb.from("outbox").insert({
            channel: "EMAIL", recipient_name: person.name, recipient_contact: person.email,
            subject: "Your overdue tasks", body, message_type: "OVERDUE TASK REMINDER",
            status: "Sent", source: "automation-overdue", person_id: pid,
            created_at: iso, sent_at: iso,
          });
        }
      }
    } else {
      const { createOverdueReminderDrafts } = await import("@/lib/automation-suggestions");
      const res = await createOverdueReminderDrafts(rows, { cooldownDays: cfg.cooldownDays });
      prepared = res.created; skipped = res.skipped;
    }
    if (!force) await markRanToday("overdue");
    results.push({ category: "overdue", mode: overdue.mode, prepared, sent, skipped });
    await recordEvent("email.automation.overdue", "ok", { prepared, sent, skipped, mode: overdue.mode });
  }

  // --- Document/permit renewal nudges (PREPARE) ---
  const renewals = cfg.categories.renewals;
  if (renewals.mode !== "off" && (force || !(await alreadyRanToday("renewals")))) {
    const { listDocuments } = await import("@/lib/documents");
    const { getDocumentRenewalCandidates } = await import("@/lib/automation-suggestions");
    const docs = await listDocuments();
    const candidates = await getDocumentRenewalCandidates(docs);
    let prepared = 0, sent = 0;
    if (renewals.mode === "auto") {
      // Auto: a renewals digest to the owner (company docs have no single email).
      if (candidates.length > 0) {
        const lines = candidates.slice(0, 30).map((c) => `• ${c.document.title} — ${c.status}`);
        const text = `Documents needing renewal (${candidates.length}):\n\n${lines.join("\n")}\n\nReview in Documents & Compliance.`;
        const r = await sendOrDraftToOwner(`Renewals due — ${candidates.length} document${candidates.length === 1 ? "" : "s"}`, text, "automation-renewals");
        sent = r.sent; prepared = r.prepared;
      }
    } else {
      const { draftDocumentRenewalAction } = await import("@/app/documents/actions");
      for (const c of candidates) {
        const r = await draftDocumentRenewalAction(c.document.id); // de-duped per doc per day
        if (r.ok && r.created) prepared++;
      }
    }
    if (!force) await markRanToday("renewals");
    results.push({ category: "renewals", mode: renewals.mode, prepared, sent, skipped: 0 });
    await recordEvent("email.automation.renewals", "ok", { prepared, sent, candidates: candidates.length, mode: renewals.mode });
  }

  // --- Weekly Director Brief to the owner (AUTO-SEND, on the chosen weekday) ---
  const brief = cfg.categories.directorBrief;
  if (brief.mode !== "off" && (force || (eatWeekday(now) === cfg.briefDay && !(await alreadyRanToday("directorBrief"))))) {
    const { getBrief, briefEmail } = await import("@/lib/director-brief");
    const data = await getBrief(now, "month", null);
    const email = briefEmail(data);
    const r = await sendOrDraftToOwner(email.subject, email.body, "automation-brief");
    if (!force) await markRanToday("directorBrief");
    results.push({ category: "directorBrief", mode: brief.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
    await recordEvent("email.automation.directorBrief", "ok", { sent: r.sent, prepared: r.prepared });
  }

  // --- Probation + leave-approval reminders to the owner (AUTO-SEND) ---
  const lifecycle = cfg.categories.lifecycle;
  if (lifecycle.mode !== "off" && (force || !(await alreadyRanToday("lifecycle")))) {
    const { getBrief } = await import("@/lib/director-brief");
    const data = await getBrief(now, "month", null);
    const hr = data.hr;
    const lines: string[] = [];
    for (const p of hr.probationEnding.slice(0, 12))
      lines.push(`• Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${new Date(p.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
    for (const l of hr.pendingLeave.slice(0, 12))
      lines.push(`• Leave to approve: ${l.name} — ${l.type}, ${l.days} day${l.days === 1 ? "" : "s"} (${l.start} → ${l.end})`);
    if (lines.length > 0) {
      const text = `HR reminders — as at ${data.asAt}\n\n${lines.join("\n")}\n\nReview in the HR area when you can.`;
      const r = await sendOrDraftToOwner("HR reminders — probation & leave", text, "automation-lifecycle");
      if (!force) await markRanToday("lifecycle");
      results.push({ category: "lifecycle", mode: lifecycle.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
      await recordEvent("email.automation.lifecycle", "ok", { sent: r.sent, prepared: r.prepared, items: lines.length });
    } else if (!force) {
      await markRanToday("lifecycle");
    }
  }

  // --- Morning digest to the owner ("here's your day", AUTO-SEND) ---
  const digest = cfg.categories.morningDigest;
  if (digest.mode !== "off" && (force || !(await alreadyRanToday("morningDigest")))) {
    const built = await buildMorningDigest(now);
    if (built) {
      const r = await sendOrDraftToOwner(built.subject, built.text, "automation-morning");
      results.push({ category: "morningDigest", mode: digest.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
      await recordEvent("email.automation.morningDigest", "ok", { sent: r.sent, prepared: r.prepared });
    }
    if (!force) await markRanToday("morningDigest");
  }

  // --- Monthly board-pack reminder (1st of the month, EAT) ---
  // The board pack concentrates the most sensitive data (passports, salaries,
  // governance) — so this is a NUDGE to the owner to open it and send to the
  // director + CFO, not an automated PII email. Real PDF-attach is a later add.
  const boardPack = cfg.categories.boardPack;
  if (boardPack.mode !== "off" && (force || (eatDayOfMonth(now) === 1 && !(await alreadyRanToday("boardPack"))))) {
    // Generate the PDF server-side and attach it (no headless browser). If the
    // render fails for any reason, still send the link nudge so the run isn't lost.
    let attachments: Array<{ filename: string; content: string; contentType?: string; encoding: "base64" }> | undefined;
    try {
      const { renderBoardPackPdf } = await import("@/lib/board-pack-pdf");
      const buf = await renderBoardPackPdf(now);
      const stamp = now.toISOString().slice(0, 10);
      attachments = [{ filename: `Board-Pack-${stamp}.pdf`, content: buf.toString("base64"), contentType: "application/pdf", encoding: "base64" }];
    } catch (e) {
      await recordEvent("email.automation.boardPack", "error", { message: "pdf-render-failed", detail: e instanceof Error ? e.message : String(e) });
    }
    // Worded to stay honest whether the PDF is attached (sent path), missing
    // (render failed), or this becomes an Outbox draft with no attachment.
    const text = [
      attachments ? `The monthly board pack PDF is attached (open it online if your client strips it).` : `The monthly board pack is ready — open it online (PDF not attached).`,
      ``,
      `It covers compliance, finance, the risk register, governance (cap table / UBO / signatories), immigration and the safety-net appendix.`,
      `Most sensitive artifact — for the director + CFO only.`,
      ``,
      `View online: ${appUrl()}/brief/board`,
    ].join("\n");
    const r = await sendOrDraftToOwner("Board pack — monthly", text, "automation-boardpack", attachments);
    if (!force) await markRanToday("boardPack");
    results.push({ category: "boardPack", mode: boardPack.mode, prepared: r.prepared, sent: r.sent, skipped: 0 });
    await recordEvent("email.automation.boardPack", "ok", { sent: r.sent, prepared: r.prepared, pdf: !!attachments });
  }

  return { ran: results.length > 0, categories: results };
}
