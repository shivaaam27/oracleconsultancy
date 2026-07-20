// /api/cron/ori-automations — fires ORI's standing automation rules (the ones the
// agent creates from a conversation: remind before deadline, nudge until update,
// escalate if no update, create event after deadline). Distinct from
// /api/cron/automations (recurring-obligation tasks). Owner autonomy = "trust
// standing rules once set up": the owner approved each rule at creation, so it
// fires here without re-confirming. DORMANT until scheduled — invoke with the cron
// secret. Reminders/nudges go via in-app notification + web push (both wired);
// external email/WhatsApp send is layered later behind the send guardrails.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { sb } from "@/db/supabase";
import { createNotification, personRecipient } from "@/lib/notifications";
import { createCalendarEvent } from "@/lib/calendar";
import { reindexEntity } from "@/lib/index-hooks";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { canAutoSend, type SendChannel } from "@/lib/guardrails";
import { evaluateRule, smartFiredKey, smartFiredKeyFor, darDayStart, type AutomationRuleRow, type RuleConfig, type RuleKind } from "@/lib/ori/automations";
import { managersOf, directorsOfCompany, allDirectors, allManagers } from "@/lib/ori/audiences";
import { getAppSettings } from "@/lib/settings";

const DAY = 86_400_000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function d(v: unknown): Date | null { return v ? new Date(v as string) : null; }

async function assigneeIds(taskId: number): Promise<number[]> {
  const [{ data: links }, { data: task }] = await Promise.all([
    sb.from("task_assignees").select("person_id").eq("task_id", taskId),
    sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle(),
  ]);
  const ids = new Set<number>(((links ?? []) as { person_id: number }[]).map((l) => l.person_id));
  const owner = (task as { owner_id?: number | null })?.owner_id;
  if (owner) ids.add(owner);
  return [...ids];
}

async function lastUpdateAt(taskId: number): Promise<Date | null> {
  const { data } = await sb.from("task_updates").select("created_at").eq("task_id", taskId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return d((data as { created_at?: string })?.created_at);
}

/** The task's most-recent update (body + when) for ESCALATION-WITH-CONTEXT: an
 *  escalation message names the last update text + how long it's been silent, so the
 *  recipient can act without opening the task. Best-effort — returns a ready-made
 *  suffix like " Last update 3d ago: \"…\"." (or " No updates yet." when none). */
async function escalationContext(taskId: number, now: Date): Promise<string> {
  try {
    const { data } = await sb.from("task_updates").select("body,created_at").eq("task_id", taskId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const row = data as { body?: string | null; created_at?: string } | null;
    if (!row?.created_at) return " No updates posted yet.";
    const when = new Date(row.created_at).getTime();
    const days = Math.max(0, Math.floor((now.getTime() - when) / DAY));
    const silent = days === 0 ? "today" : `${days}d ago`;
    const text = (row.body ?? "").trim().replace(/\s+/g, " ").slice(0, 140);
    return text ? ` Last update ${silent}: "${text}".` : ` Last update ${silent} (no text).`;
  } catch {
    return "";
  }
}

/** A short " It's overdue / due in Nh." context line for a repeating nudge, so the
 *  person understands why ORI keeps pinging. Best-effort — empty when no deadline. */
function intervalContextLine(target: SmartTarget | null, now: Date): string {
  const dl = target?.deadline ? new Date(target.deadline).getTime() : null;
  if (dl == null) return " Still awaiting your update.";
  const diff = dl - now.getTime();
  if (diff <= 0) {
    const days = Math.floor(-diff / DAY);
    return days >= 1 ? ` It's ${days} day(s) overdue.` : " It's overdue.";
  }
  const hrs = Math.ceil(diff / 3_600_000);
  return hrs <= 48 ? ` It's due in about ${hrs}h.` : ` It's due soon.`;
}

/** Once-per-Dar-local-day dedupe for the always-on signal checks (decision reminder,
 *  quiet-staff). Reads/writes a single settings row; returns true only when today's
 *  key hasn't been stamped yet. Fail-open: any error → allow the check to run. */
async function claimDailySignal(key: string, now: Date): Promise<boolean> {
  const shifted = new Date(now.getTime() + 3 * 3_600_000);
  const dayKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  const settingKey = `ori.signal.${key}`;
  try {
    const { data } = await sb.from("settings").select("value").eq("key", settingKey).maybeSingle();
    if ((data as { value?: string } | null)?.value === dayKey) return false; // already ran today
    await sb.from("settings").upsert({ key: settingKey, value: dayKey }, { onConflict: "key" });
    return true;
  } catch {
    return true; // fail-open — better to notify than to go silent
  }
}

type Contact = { name: string; email: string | null; whatsapp: string | null; managerId: number | null };
async function personContact(id: number): Promise<Contact | null> {
  const { data } = await sb.from("people").select("name,email,whatsapp,phone,manager_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    name: (r.name as string) ?? "",
    email: (r.email as string | null) || null,
    whatsapp: ((r.whatsapp as string | null) || (r.phone as string | null)) || null,
    managerId: (r.manager_id as number | null) ?? null,
  };
}

/**
 * Phase 6b — OPTIONAL external send, guardrail-gated. A reminder/nudge/escalation
 * already lands in-app + push; when the rule carries an email/WhatsApp `channel`
 * AND the owner has switched auto-send ON for it (canAutoSend — FAILS CLOSED), we
 * also send it out that way. If the channel is off (or "push"/unset), this no-ops
 * and the caller's behaviour is exactly as before. Best-effort: never throws.
 */
async function externalNotify(config: RuleConfig, personIds: number[], subject: string, body: string): Promise<number> {
  const raw = (config.channel ?? "").toLowerCase();
  if (raw !== "email" && raw !== "whatsapp" && raw !== "sms") return 0; // in-app only
  const channel = raw as SendChannel;
  if (!(await canAutoSend(channel))) return 0; // guardrail off → fail closed, no send
  let sent = 0;
  for (const pid of personIds) {
    try {
      const c = await personContact(pid);
      if (!c) continue;
      if (channel === "email") {
        if (!c.email) continue;
        const { sendEmail } = await import("@/lib/email/send");
        const res = await sendEmail({ to: c.email, subject, text: `${body}`, fromName: "ORI" });
        if (res.ok) sent++;
      } else {
        // whatsapp / sms both go through the WhatsApp helper's free-form text path.
        if (!c.whatsapp) continue;
        const { sendWhatsApp } = await import("@/lib/whatsapp");
        const res = await sendWhatsApp({ to: c.whatsapp, text: `${subject}\n\n${body}` });
        if (res.ok) sent++;
      }
    } catch (e) {
      await reportError(e, { route: "cron.ori-automations", step: "externalNotify", channel, personId: pid });
    }
  }
  return sent;
}

/** Is a person on APPROVED leave that covers `day` (a YYYY-MM-DD string)? */
async function onApprovedLeave(personId: number, day: string): Promise<boolean> {
  const { data } = await sb
    .from("leave_requests")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "Approved")
    .lte("start_date", `${day}T23:59:59Z`)
    .gte("end_date", `${day}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** The end date (YYYY-MM-DD) of the approved leave covering `day`, for the "until …"
 *  line in a handover notice. Best-effort — null when unknown. */
async function approvedLeaveEnd(personId: number, day: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from("leave_requests")
      .select("end_date")
      .eq("person_id", personId)
      .eq("status", "Approved")
      .lte("start_date", `${day}T23:59:59Z`)
      .gte("end_date", `${day}T00:00:00Z`)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const end = (data as { end_date?: string } | null)?.end_date;
    return end ? String(end).slice(0, 10) : null;
  } catch { return null; }
}

/**
 * auto_reassign_on_leave firing. If the task's current owner is on approved leave
 * today, hand the task to the fallback (or the owner's manager) for the window and
 * remember whom we displaced in the rule config; once they're back off leave, hand
 * it straight back. Idempotent — safe to run every day. The daily cadence is set by
 * the pure evaluator; this does the DB work.
 */
async function coverTaskOnLeave(taskId: number, code: string, companyId: number | null, config: RuleConfig, nowIso: string): Promise<void> {
  const cfg = config as RuleConfig & { _coveredFor?: number; _coveredBy?: number };
  const day = nowIso.slice(0, 10);
  const { data: task } = await sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle();
  const currentOwner = (task as { owner_id?: number | null })?.owner_id ?? null;

  // Already covering? If the displaced person is back off leave, revert.
  if (cfg._coveredFor) {
    const stillOff = await onApprovedLeave(cfg._coveredFor, day);
    if (!stillOff) {
      await sb.from("tasks").update({ owner_id: cfg._coveredFor, last_updated_at: nowIso }).eq("id", taskId);
      await sb.from("task_assignees").delete().eq("task_id", taskId);
      await sb.from("task_assignees").upsert({ task_id: taskId, person_id: cfg._coveredFor }, { ignoreDuplicates: true });
      void reindexEntity("task", taskId);
      const orig = await personContact(cfg._coveredFor);
      await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI handed ${code} back`, body: `${orig?.name ?? "The assignee"} is back from leave — ${code} returned to them.`, actor: "ORI" });
      // Clear the cover markers on the rule config.
      const next = { ...config }; delete (next as Record<string, unknown>)._coveredFor; delete (next as Record<string, unknown>)._coveredBy;
      await sb.from("automation_rules").update({ config: next }).eq("kind", "auto_reassign_on_leave").eq("task_id", taskId);
    }
    return;
  }

  // Not covering yet. If the current owner is on leave today, hand the task over.
  if (!currentOwner) return;
  if (!(await onApprovedLeave(currentOwner, day))) return;

  let coverId = typeof config.fallbackPersonId === "number" ? config.fallbackPersonId : null;
  if (!coverId) {
    const owner = await personContact(currentOwner);
    coverId = owner?.managerId ?? null;
  }
  if (!coverId || coverId === currentOwner) return; // nobody to cover → leave as-is
  // Don't bounce to someone who's also on leave.
  if (await onApprovedLeave(coverId, day)) return;

  await sb.from("tasks").update({ owner_id: coverId, last_updated_at: nowIso }).eq("id", taskId);
  await sb.from("task_assignees").delete().eq("task_id", taskId);
  await sb.from("task_assignees").upsert({ task_id: taskId, person_id: coverId }, { ignoreDuplicates: true });
  void reindexEntity("task", taskId);
  const cover = await personContact(coverId);
  const orig = await personContact(currentOwner);
  await createNotification({ recipient: personRecipient(coverId), kind: "assigned", taskId, taskCode: code, title: `Covering ${code}`, body: `${orig?.name ?? "A colleague"} is on leave — ORI has handed you ${code} until they're back.`, actor: "ORI" });
  await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI covered ${code}`, body: `${orig?.name ?? "The assignee"} is on leave — ${code} handed to ${cover?.name ?? "cover"}.`, actor: "ORI" });
  // HANDOVER NOTIFY — tell the covering person's manager(s) their report picked up work.
  const until = await approvedLeaveEnd(currentOwner, day);
  const untilStr = until ? ` until ${until}` : "";
  for (const mgrId of await managersOf(coverId)) {
    if (mgrId === coverId) continue;
    await createNotification({ recipient: personRecipient(mgrId), kind: "assigned", taskId, taskCode: code, title: `${cover?.name ?? "Your report"} is covering ${code}`, body: `${orig?.name ?? "A colleague"} is on leave — ORI moved ${code} to ${cover?.name ?? "them"}${untilStr}.`, actor: "ORI" });
  }
  const next = { ...config, _coveredFor: currentOwner, _coveredBy: coverId };
  await sb.from("automation_rules").update({ config: next }).eq("kind", "auto_reassign_on_leave").eq("task_id", taskId);
}

type SmartTarget = { id: number; code: string; company_id: number | null; deadline: string | null; status: string; created_date: string | null };

/** Resolve the task a smart_reminder acts on: an explicit scope.taskId, else the
 *  scoped person's / company's most-overdue OPEN task (best effort; null if none). */
async function resolveSmartTarget(cfg: RuleConfig): Promise<SmartTarget | null> {
  const sel = "id,code,company_id,deadline,status,created_date";
  const scope = cfg.scope ?? {};
  if (typeof scope.taskId === "number") {
    const { data } = await sb.from("tasks").select(sel).eq("id", scope.taskId).maybeSingle();
    return (data as SmartTarget) ?? null;
  }
  const open = ["Completed", "Closed"];
  if (typeof scope.personId === "number") {
    // Their most-overdue open task (owned or assigned). Owner is the simplest signal.
    const { data } = await sb.from("tasks").select(sel).eq("owner_id", scope.personId).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    if (data) return data as SmartTarget;
    const { data: link } = await sb.from("task_assignees").select("task_id").eq("person_id", scope.personId).limit(50);
    const ids = ((link ?? []) as { task_id: number }[]).map((l) => l.task_id);
    if (!ids.length) return null;
    const { data: t } = await sb.from("tasks").select(sel).in("id", ids).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    return (t as SmartTarget) ?? null;
  }
  if (typeof scope.companyId === "number") {
    const { data } = await sb.from("tasks").select(sel).eq("company_id", scope.companyId).not("status", "in", `(${open.join(",")})`).order("deadline", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    return (data as SmartTarget) ?? null;
  }
  return null;
}

type DigestTask = SmartTarget & { owner_id: number | null; action_item: string | null };

/** Resolve the full set of internal recipients for a smart_reminder's audience,
 *  role-scoped so ONE digest engine serves owner / manager / director / staff:
 *   · notifyOwner    → the owner ("admin")
 *   · warnPerson     → the scoped person (personId scope)
 *   · notifyPersonIds→ explicit extra people
 *   · notifyManagers → the scoped person's managers; for a company/all scope, every manager
 *   · notifyDirectors→ the scoped company's directors; for a person scope, that person's
 *                      company directors; otherwise all directors
 *  Best-effort — a failed lookup just contributes nobody. */
async function resolveAudience(cfg: RuleConfig): Promise<Set<string>> {
  const audience = (cfg.audience ?? {}) as RuleConfig["audience"] & { notifyManagers?: boolean };
  const scope = cfg.scope ?? {};
  const recipients = new Set<string>();
  if (audience?.notifyOwner) recipients.add("admin");
  if (audience?.warnPerson && typeof scope.personId === "number") recipients.add(personRecipient(scope.personId));
  for (const id of (audience?.notifyPersonIds ?? [])) if (typeof id === "number") recipients.add(personRecipient(id));

  if (audience?.notifyManagers) {
    let ids: number[] = [];
    if (typeof scope.personId === "number") ids = await managersOf(scope.personId);
    else ids = await allManagers(); // company / all scope → every manager
    for (const id of ids) recipients.add(personRecipient(id));
  }

  if (audience?.notifyDirectors) {
    let ids: number[] = [];
    if (typeof scope.companyId === "number") ids = await directorsOfCompany(scope.companyId);
    else if (typeof scope.personId === "number") {
      // The scoped person's company directors (fall back to all directors if company-less).
      const { data } = await sb.from("people").select("company_id").eq("id", scope.personId).maybeSingle();
      const cid = (data as { company_id?: number | null } | null)?.company_id ?? null;
      ids = typeof cid === "number" ? await directorsOfCompany(cid) : await allDirectors();
    } else ids = await allDirectors();
    for (const id of ids) recipients.add(personRecipient(id));
  }
  return recipients;
}

/** Every OPEN task a digest smart_reminder's scope covers, condition-filtered
 *  (due_tomorrow = deadline inside tomorrow's Dar-local day; overdue = deadline
 *  passed; anything else = all open in scope). Worst-first, capped at 50. */
async function resolveSmartDigestTasks(cfg: RuleConfig, now: Date): Promise<DigestTask[]> {
  const scope = cfg.scope ?? {};
  const sel = "id,code,company_id,deadline,status,created_date,owner_id,action_item";
  let q = sb.from("tasks").select(sel)
    .not("status", "in", "(Completed,Closed)")
    .eq("archived", false)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(200);
  if (typeof scope.companyId === "number") q = q.eq("company_id", scope.companyId);
  if (typeof scope.taskId === "number") q = q.eq("id", scope.taskId);
  const { data } = await q;
  let rows = ((data ?? []) as DigestTask[]);
  if (typeof scope.personId === "number") {
    const { data: links } = await sb.from("task_assignees").select("task_id").eq("person_id", scope.personId).limit(500);
    const assigned = new Set(((links ?? []) as { task_id: number }[]).map((l) => l.task_id));
    rows = rows.filter((r) => r.owner_id === scope.personId || assigned.has(r.id));
  }
  const cond = cfg.condition ?? "always";
  const nowMs = now.getTime();
  const agingDays = Math.max(0, Math.round(cfg.agingDays ?? (cond === "under_review_stale" ? 2 : 3)));
  if (cond === "due_tomorrow") {
    const start = darDayStart(now) + DAY;
    rows = rows.filter((r) => { const t = r.deadline ? new Date(r.deadline).getTime() : null; return t != null && t >= start && t < start + DAY; });
  } else if (cond === "overdue") {
    rows = rows.filter((r) => { const t = r.deadline ? new Date(r.deadline).getTime() : null; return t != null && t <= nowMs; });
  } else if (cond === "under_review_stale") {
    // Sat in "Under Review" with no update for `agingDays` (default 2).
    rows = rows.filter((r) => r.status === "Under Review");
    rows = await filterByUpdateSilence(rows, nowMs - agingDays * DAY);
  } else if (cond === "no_update_today") {
    // No update since Dar-local start of today.
    rows = await filterByUpdateSilence(rows, darDayStart(now));
  } else if (cond === "waiting_external_aged") {
    rows = rows.filter((r) => r.status === "Waiting External");
    rows = await filterByUpdateSilence(rows, nowMs - agingDays * DAY);
  } else if (cond === "no_deadline_or_assignee") {
    rows = rows.filter((r) => r.deadline == null || r.owner_id == null);
  }
  return rows.slice(0, 50);
}

/** Keep only tasks whose most-recent (non-deleted) update is OLDER than `sinceMs`
 *  (i.e. they've gone silent past the cut-off). Tasks never updated are kept.
 *  One batched query over the candidate ids; fail-open (keeps all) on error. */
async function filterByUpdateSilence(rows: DigestTask[], sinceMs: number): Promise<DigestTask[]> {
  if (!rows.length) return rows;
  try {
    const ids = rows.map((r) => r.id);
    const { data } = await sb.from("task_updates").select("task_id,created_at").in("task_id", ids).is("deleted_at", null);
    const latest = new Map<number, number>();
    for (const u of ((data ?? []) as { task_id: number; created_at: string }[])) {
      const t = new Date(u.created_at).getTime();
      const prev = latest.get(u.task_id) ?? 0;
      if (t > prev) latest.set(u.task_id, t);
    }
    return rows.filter((r) => (latest.get(r.id) ?? 0) < sinceMs);
  } catch {
    return rows;
  }
}

/** "Silence" conditions — the task hasn't moved and someone OWES an update. For
 *  these we group/sort the digest by who owes it, so a manager/director reads it as
 *  "these people owe you an update" rather than a flat task list. */
const SILENCE_CONDS = new Set(["no_update_today", "under_review_stale"]);

/** Batch-resolve short display names for a set of person ids (best-effort). */
async function nameMap(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const clean = Array.from(new Set(ids.filter((n): n is number => typeof n === "number")));
  if (!clean.length) return out;
  try {
    const { data } = await sb.from("people").select("id,name").in("id", clean);
    for (const r of ((data ?? []) as { id: number; name: string | null }[])) out.set(r.id, (r.name ?? "").trim() || `#${r.id}`);
  } catch { /* fail-open — names just fall back to #id */ }
  return out;
}

/** Fire a digest smart_reminder: ONE aggregated notification per audience member
 *  listing every matching task, worst-first. Each line = CODE — title — (owner) —
 *  status. For a "silence" digest (no_update/under_review_stale) the lines are
 *  grouped and sorted by WHO owes the update. Notify-only — auto-act is deliberately
 *  skipped for digests (acting on many tasks at once from one rule is too blunt).
 *  Best-effort per recipient. */
async function fireSmartDigest(cfg: RuleConfig, tasks: DigestTask[], nowIso: string): Promise<void> {
  void nowIso;
  const cond = cfg.condition ?? "always";
  const noun = cond === "due_tomorrow" ? "due tomorrow"
    : cond === "overdue" ? "overdue"
    : cond === "under_review_stale" ? "stuck in review"
    : cond === "waiting_external_aged" ? "waiting on an external party"
    : cond === "no_deadline_or_assignee" ? "missing a deadline or owner"
    : cond === "no_update_today" ? "with no update today"
    : "needing attention";
  const title = `${tasks.length} task${tasks.length === 1 ? "" : "s"} ${noun}`;

  // Worst-first: overdue (soonest-past first), then due-soonest, then no-deadline last.
  const now = Date.now();
  const rank = (t: DigestTask): number => {
    const dl = t.deadline ? new Date(t.deadline).getTime() : null;
    if (dl == null) return Number.MAX_SAFE_INTEGER;      // no deadline → last
    return dl <= now ? dl - now : dl;                    // overdue negative (most-overdue first), else soonest-due
  };
  const sorted = [...tasks].sort((a, b) => rank(a) - rank(b));

  const names = await nameMap(sorted.map((t) => t.owner_id).filter((n): n is number => typeof n === "number"));
  const ownerLabel = (t: DigestTask) => (typeof t.owner_id === "number" ? names.get(t.owner_id) ?? `#${t.owner_id}` : "unassigned");
  const lineOf = (t: DigestTask) =>
    `${t.code} — ${(t.action_item ?? "").slice(0, 70)} — (${ownerLabel(t)}) — ${t.status}`;

  let lines: string[];
  if (SILENCE_CONDS.has(cond)) {
    // Group by who owes the update, most-tasks-owed first, worst-first within a person.
    const byPerson = new Map<string, DigestTask[]>();
    for (const t of sorted) {
      const key = ownerLabel(t);
      const bucket = byPerson.get(key) ?? [];
      bucket.push(t);
      byPerson.set(key, bucket);
    }
    const groups = [...byPerson.entries()].sort((a, b) => b[1].length - a[1].length);
    lines = [];
    for (const [person, ts] of groups) {
      lines.push(`${person} (${ts.length}):`);
      for (const t of ts.slice(0, 8)) lines.push(`  ${t.code} — ${(t.action_item ?? "").slice(0, 60)} — ${t.status}`);
    }
    lines = lines.slice(0, 20);
  } else {
    lines = sorted.slice(0, 15).map(lineOf);
    if (sorted.length > 15) lines.push(`…and ${sorted.length - 15} more`);
  }
  const body = lines.join("\n");

  const recipients = await resolveAudience(cfg);
  for (const r of recipients) {
    try {
      await createNotification({ recipient: r, kind: "assigned", taskId: sorted[0]?.id ?? null, taskCode: sorted[0]?.code ?? null, title, body, actor: "ORI" });
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.digest", recipient: r }); }
  }
}

/**
 * Perform a fired smart_reminder in SAFE order:
 *   1) AUDIENCE (always allowed, internal) — owner / directors / the scoped person /
 *      extra people, via createNotification (honours quiet hours + digest + push).
 *   2) AUTO-ACT (ONLY if actions.autoAct === true, the opt-in; default OFF):
 *        · postUpdate → an update authored created_by:"ori" (same shape as post_as_ori);
 *        · setStatus  → change the task's status;
 *        · sendChannel → external email/WhatsApp ONLY if canAutoSend() (fail-closed).
 *   Never auto-deletes. Each effect is wrapped so one failure never aborts the rest.
 */
async function fireSmartReminder(cfg: RuleConfig, target: SmartTarget | null, nowIso: string, opts?: { interval?: boolean; target?: SmartTarget | null }): Promise<void> {
  const actions = cfg.actions ?? {};
  const code = target?.code ?? null;
  const label = "ORI reminder";
  // For a repeating nudge, add a one-line "due soon / overdue" context so the
  // recipient sees WHY they're being pinged again.
  const ctx = opts?.interval ? intervalContextLine(target, new Date(nowIso)) : "";
  const body = (actions.updateText?.trim()
    || (code ? `A reminder about ${code} — it's due for an update.` : "A reminder from ORI — this is due for an update."))
    + ctx;

  // 1) AUDIENCE — internal notifications (always allowed). Role-scoped via the shared
  // resolver (owner / scoped person / managers / company directors). Best-effort each.
  const recipients = await resolveAudience(cfg);
  for (const r of recipients) {
    try {
      await createNotification({ recipient: r, kind: "assigned", taskId: target?.id ?? null, taskCode: code, title: code ? `${label}: ${code}` : label, body, actor: "ORI" });
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.audience", recipient: r }); }
  }

  // 2) AUTO-ACT — opt-in ONLY. Default off = nothing below runs.
  if (actions.autoAct !== true || !target) return;

  if (actions.postUpdate) {
    try {
      const text = actions.updateText?.trim() || "ORI: this task is now due — please post an update.";
      await sb.from("task_updates").insert({ task_id: target.id, body: text, created_at: nowIso, created_by: "ori" });
      await sb.from("tasks").update({ latest_update: text, last_updated_at: nowIso }).eq("id", target.id);
      void reindexEntity("task", target.id);
      // Posting directly here BYPASSES the portal/admin notify-on-update path, so
      // push the task's assignees ourselves — skipping anyone the audience step
      // already reached, so nobody hears the same thing twice.
      for (const pid of await assigneeIds(target.id)) {
        const r = personRecipient(pid);
        if (recipients.has(r)) continue;
        try {
          await createNotification({ recipient: r, kind: "assigned", taskId: target.id, taskCode: code, title: code ? `ORI posted an update on ${code}` : "ORI posted an update", body: text, actor: "ORI" });
        } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.postUpdate.notify", personId: pid }); }
      }
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.postUpdate", taskId: target.id }); }
  }

  if (actions.setStatus) {
    try {
      const status = actions.setStatus;
      const patch: Record<string, unknown> = { status, last_updated_at: nowIso };
      if (status === "Completed" || status === "Closed") patch.closed_date = nowIso;
      await sb.from("tasks").update(patch).eq("id", target.id);
      void reindexEntity("task", target.id);
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.setStatus", taskId: target.id }); }
  }

  if (actions.sendChannel === "email" || actions.sendChannel === "whatsapp") {
    try {
      // Send to the scoped person (best target for a "you're due" nudge).
      const pid = cfg.scope?.personId;
      if (typeof pid === "number") {
        if (await canAutoSend(actions.sendChannel as SendChannel)) {
          await externalNotify({ channel: actions.sendChannel }, [pid], code ? `${label}: ${code}` : label, body);
        } else {
          await recordEvent("cron.ori-automations", "ok", { smart: "guardrail off", channel: actions.sendChannel });
        }
      }
    } catch (e) { await reportError(e, { route: "cron.ori-automations", step: "smart.send", channel: actions.sendChannel }); }
  }
}

/**
 * DECISION REMINDER — a small always-on daily check. Any governance `decisions` row
 * still undecided (status ≠ "Decided") whose `due` date has passed by ≥ agingDays
 * (default 5) → ONE digest notification to the owner. Once/day dedupe. Notify-only —
 * never acts on a decision. Fail-open. `due` is the only age signal on the table.
 */
async function checkUndecided(now: Date, agingDaysFallback = 5): Promise<number> {
  try {
    // Owner gate + threshold (fail-open: any read error → enabled/default = today's behaviour).
    let enabled = true, agingDays = agingDaysFallback;
    try {
      const s = await getAppSettings();
      enabled = s.signalDecisionReminderEnabled;
      agingDays = s.signalDecisionReminderDays;
    } catch { /* fail-open */ }
    if (!enabled) return 0;
    if (!(await claimDailySignal("undecided-decisions", now))) return 0;
    const { data } = await sb.from("decisions").select("code,title,due,status").neq("status", "Decided").limit(200);
    const cutoff = now.getTime() - Math.max(0, agingDays) * DAY;
    const stale = ((data ?? []) as { code: string; title: string; due: string | null; status: string }[])
      .filter((r) => r.due != null && new Date(r.due).getTime() <= cutoff)
      .sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime());
    if (!stale.length) return 0;
    const lines = stale.slice(0, 12).map((r) => {
      const days = Math.floor((now.getTime() - new Date(r.due!).getTime()) / DAY);
      return `${r.code} — ${(r.title ?? "").slice(0, 70)} (${days}d past due)`;
    });
    if (stale.length > 12) lines.push(`…and ${stale.length - 12} more`);
    await createNotification({
      recipient: "admin", kind: "assigned",
      title: `${stale.length} decision${stale.length === 1 ? "" : "s"} still open`,
      body: `These board decisions are past due and undecided:\n${lines.join("\n")}`,
      actor: "ORI",
    });
    return stale.length;
  } catch (e) {
    await reportError(e, { route: "cron.ori-automations", step: "checkUndecided" });
    return 0;
  }
}

/**
 * QUIET-STAFF CHECK — a small always-on daily check. Staff who have NOT opened the
 * portal in ≥ quietDays (default 5; activity_events kind="open") AND still have OPEN
 * assigned tasks → notify their MANAGER (and the owner). Once/day dedupe. Owner-only
 * telemetry rule: the manager gets "X has open tasks and has been quiet", NOT the raw
 * activity log. Fail-open.
 */
async function checkQuietStaff(now: Date, quietDaysFallback = 5): Promise<number> {
  try {
    // Owner gate + threshold (fail-open: any read error → enabled/default = today's behaviour).
    let enabled = true, quietDays = quietDaysFallback;
    try {
      const s = await getAppSettings();
      enabled = s.signalQuietStaffEnabled;
      quietDays = s.signalQuietStaffDays;
    } catch { /* fail-open */ }
    if (!enabled) return 0;
    if (!(await claimDailySignal("quiet-staff", now))) return 0;
    const since = new Date(now.getTime() - quietDays * DAY).toISOString();
    // Everyone who HAS opened the portal within the window → the "seen recently" set.
    const { data: seenRows } = await sb.from("activity_events").select("person_id").eq("kind", "open").not("person_id", "is", null).gte("at", since).limit(5000);
    const seen = new Set(((seenRows ?? []) as { person_id: number }[]).map((r) => r.person_id));

    // Owners of OPEN tasks (the people who'd be quiet-with-work).
    const { data: openTasks } = await sb.from("tasks").select("owner_id").not("status", "in", "(Completed,Closed)").eq("archived", false).not("owner_id", "is", null).limit(5000);
    const openCount = new Map<number, number>();
    for (const t of ((openTasks ?? []) as { owner_id: number }[])) openCount.set(t.owner_id, (openCount.get(t.owner_id) ?? 0) + 1);

    // Quiet = has open tasks, hasn't opened the portal in the window, still active.
    const quietIds = [...openCount.keys()].filter((id) => !seen.has(id));
    if (!quietIds.length) return 0;
    const { data: activeRows } = await sb.from("people").select("id,name").in("id", quietIds).eq("active", true);
    const active = (activeRows ?? []) as { id: number; name: string | null }[];
    if (!active.length) return 0;

    let notified = 0;
    const ownerLines: string[] = [];
    for (const p of active) {
      const n = openCount.get(p.id) ?? 0;
      const name = (p.name ?? "").trim() || `#${p.id}`;
      ownerLines.push(`${name} — ${n} open task${n === 1 ? "" : "s"}, quiet ≥${quietDays}d`);
      // Manager-facing message: no raw telemetry, just the signal.
      for (const mgrId of await managersOf(p.id)) {
        if (mgrId === p.id) continue;
        await createNotification({
          recipient: personRecipient(mgrId), kind: "assigned",
          title: `${name} has been quiet`,
          body: `${name} has ${n} open task${n === 1 ? "" : "s"} and hasn't been active in the portal for ${quietDays}+ days — worth a nudge.`,
          actor: "ORI",
        });
        notified++;
      }
    }
    // Owner gets the roll-up (owner may see the aggregate signal).
    if (ownerLines.length) {
      await createNotification({
        recipient: "admin", kind: "assigned",
        title: `${active.length} staff quiet with open work`,
        body: `Quiet ${quietDays}+ days but still holding open tasks:\n${ownerLines.slice(0, 15).join("\n")}`,
        actor: "ORI",
      });
    }
    return notified;
  } catch (e) {
    await reportError(e, { route: "cron.ori-automations", step: "checkQuietStaff" });
    return 0;
  }
}

/**
 * Sweep every active ORI automation rule once and perform the actions for the ones
 * that FIRE this tick. Shared by the daily Vercel cron (GET below) AND the secured
 * /api/cron/tick endpoint an external scheduler can hit more often — the same code
 * fires each rule at most once per day-slot (lastFiredKey/last_fired_at dedupe), so
 * calling it 100×/day is safe. Fail-open: one rule's failure never aborts the rest.
 */
export async function runDueRules(now = new Date()): Promise<{ evaluated: number; fired: number; retired: number }> {
  const nowIso = now.toISOString();
  let fired = 0, retired = 0, evaluated = 0;

  {
    const { data: rules } = await sb
      .from("automation_rules")
      .select("id,task_id,company_id,kind,config,active,done,created_at,last_fired_at,created_by")
      .eq("active", true).eq("done", false)
      .limit(500);

    for (const raw of (rules ?? []) as Record<string, unknown>[]) {
      const taskId = raw.task_id as number | null;

      // recurring_task isn't bound to a live task — evaluate it against a synthetic
      // always-open task so only its cadence gates firing, and create a fresh task
      // when it's due.
      if (raw.kind === "recurring_task") {
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "recurring_task", config: (raw.config as RuleConfig) ?? {},
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, { deadline: null, status: "In Progress", createdDate: null }, null, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.fire) {
          patch.last_fired_at = nowIso;
          fired++;
          try {
            const cfg = rule.config;
            const companyId = cfg.companyId as number | undefined;
            const title = (cfg.title as string | undefined)?.trim();
            if (companyId && title) {
              const { data: comp } = await sb.from("companies").select("code").eq("id", companyId).maybeSingle();
              const priority = ["Critical", "High", "Medium", "Low"].includes(String(cfg.priority)) ? String(cfg.priority) : "Medium";
              // The owner's chosen starting status (never Completed/Closed — a
              // freshly recreated occurrence is always open); default Not Started.
              const OPEN = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
              const status = OPEN.includes(String(cfg.status)) ? String(cfg.status) : "Not Started";
              const description = (cfg.description as string | undefined)?.trim() || null;
              const created = new Date();
              const task = await insertTaskWithUniqueCodeSb(companyId, (comp?.code as string) ?? "", {
                actionItem: title, status, priority, escalation: "No",
                deadline: null, createdDate: created, lastUpdatedAt: created, archived: false, category: "Admin",
                comments: description,
              });
              const aIds = Array.isArray(cfg.assigneePersonIds) ? (cfg.assigneePersonIds as number[]) : [];
              for (const pid of aIds) await sb.from("task_assignees").upsert({ task_id: task.id, person_id: pid }, { ignoreDuplicates: true });
              // Attribute the audit entry to whoever owns the standing rule (portal
              // rules stamp "portal-dir:<Name>" / "portal-mgr:<Name>" / "portal-hr:<Name>";
              // the AI chat path stamps "ai-command"; the Command Centre builder "web-ui").
              const ruleCreatedBy = (raw.created_by as string | null) || "ai-command";
              await sb.from("audit_log").insert({ task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task", old_value: null, new_value: title, change_reason: "Recurring task (ORI automation)", created_at: nowIso, created_by: ruleCreatedBy });
              void reindexEntity("task", task.id);
            }
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "recurring_task" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      // scheduled_macro — like recurring_task, cadence-gated and NOT task-bound. When
      // due we SURFACE the saved macro's steps as a confirm-and-run prompt for the
      // owner; we NEVER auto-execute the steps (that would be Tier 3 send/spend/delete).
      if (raw.kind === "scheduled_macro") {
        const cfg = (raw.config as RuleConfig) ?? {};
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "scheduled_macro", config: cfg,
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, { deadline: null, status: "In Progress", createdDate: null }, null, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.fire) {
          patch.last_fired_at = nowIso;
          fired++;
          try {
            const macroName = (cfg.macroName ?? "").trim();
            const { findMacro } = await import("@/lib/ai-memory");
            const macro = macroName ? await findMacro("admin", macroName) : null;
            const steps = (macro?.steps ?? "").trim();
            const label = macro?.name || macroName || "Macro";
            await createNotification({
              recipient: "admin",
              kind: "assigned",
              title: `Scheduled macro ready: ${label}`,
              body: steps
                ? `It's time to run “${label}”. Steps: ${steps.slice(0, 300)} — open ORI and say “run macro ${label}” to confirm and execute.`
                : `“${macroName}” is scheduled to run now, but its steps couldn't be found. Save it again with “save macro ${macroName}: <steps>”.`,
              actor: "ORI",
            });
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "scheduled_macro" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      // smart_reminder — a conditional, time-of-day rule with an OPT-IN auto-act.
      // It scopes to a person / company / task (not a live task row), so it's swept
      // like recurring_task: the pure evaluator gates WHEN + IF, and this branch
      // performs the SAFE-ORDERED effects (audience first, opt-in auto-act second).
      if (raw.kind === "smart_reminder") {
        const cfg = (raw.config as RuleConfig) ?? {};

        // DIGEST mode: aggregate every task the scope+condition matches into ONE
        // notification per audience member. The pure evaluator gates the WHEN
        // window + once-per-day dedupe (condition forced to "always" — the real
        // condition is applied per-task in resolveSmartDigestTasks); we only
        // stamp the day-key once something actually went out, so an empty
        // morning still lets a later tick catch tasks added during the day.
        if (cfg.digest === true) {
          const rule: AutomationRuleRow = {
            id: raw.id as number, kind: "smart_reminder", config: { ...cfg, condition: "always" },
            active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
          };
          const evalRes = evaluateRule(rule, { deadline: null, status: "In Progress", createdDate: null }, null, now);
          evaluated++;
          const patch: Record<string, unknown> = { last_run_at: nowIso };
          if (evalRes.fire) {
            const matches = await resolveSmartDigestTasks(cfg, now);
            if (matches.length) {
              fired++;
              patch.last_fired_at = nowIso;
              patch.config = { ...cfg, lastFiredKey: smartFiredKey(rule.id, now) };
              if (cfg.once === true) { patch.active = false; patch.done = true; retired++; }
              try {
                await fireSmartDigest(cfg, matches, nowIso);
              } catch (actErr) {
                await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "smart_reminder", digest: true });
              }
            }
          }
          await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
          continue;
        }

        const scopeTaskId = cfg.scope?.taskId ?? null;
        // Resolve the target task the rule acts on: an explicit scope.taskId, else
        // the scoped person/company's most-overdue open task (best effort).
        const target = await resolveSmartTarget(cfg);
        // Evaluate against the target task if we have one (so overdue/no-update read
        // real data), else a synthetic always-open task (byHour/always still work).
        const evalTask = target
          ? { deadline: d(target.deadline), status: target.status, createdDate: d(target.created_date) }
          : { deadline: null, status: "In Progress", createdDate: null };
        const lastUpd = target ? await lastUpdateAt(target.id) : null;
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "smart_reminder", config: cfg,
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, evalTask, lastUpd, now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };

        // INTERVAL mode — a repeating nudge that stops on response. The pure layer
        // decides fire vs stop; here we persist lastFiredAt/firedCount/armedAt and
        // retire on any stop condition (evalRes.deactivate). The interval + lastFiredAt
        // is the dedupe, so this is idempotent under frequent ticks.
        if (typeof cfg.repeatEveryMinutes === "number") {
          if (evalRes.deactivate) { patch.active = false; patch.done = true; retired++; }
          if (evalRes.fire) {
            fired++;
            patch.last_fired_at = nowIso;
            // Stamp armedAt on the first fire so "responded" is measured from when the
            // nagging window opened, not the rule's creation.
            const nextCfg: RuleConfig = {
              ...cfg,
              lastFiredAt: nowIso,
              firedCount: (cfg.firedCount ?? 0) + 1,
              ...(cfg.armedAt ? {} : { armedAt: nowIso }),
            };
            patch.config = nextCfg;
            // If this fire hits maxCount, retire now (don't wait for the next tick).
            if (typeof cfg.maxCount === "number" && (nextCfg.firedCount ?? 0) >= Math.max(1, Math.round(cfg.maxCount))) {
              patch.active = false; patch.done = true; retired++;
            }
            try {
              await fireSmartReminder(cfg, target, nowIso, { interval: true, target });
            } catch (actErr) {
              await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "smart_reminder", interval: true });
            }
          }
          await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
          continue;
        }

        if (evalRes.fire) {
          fired++;
          patch.last_fired_at = nowIso;
          patch.config = { ...cfg, lastFiredKey: smartFiredKeyFor(rule.id, now, cfg.trigger ?? {}, evalTask.deadline) };
          // A one-off rule RETIRES after firing — never fires again.
          if (cfg.once === true) { patch.active = false; patch.done = true; retired++; }
          try {
            await fireSmartReminder(cfg, target, nowIso);
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "smart_reminder" });
          }
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      // escalation_ladder — a per-task overdue ladder. NOT necessarily bound via
      // raw.task_id (the task lives in config.ladder.scope.taskId), so it's handled
      // here before the generic task-bound path. The pure evaluator picks the single
      // newly-due step; this branch notifies its audience (with escalation context),
      // optionally sets status→Escalated (reversible, audited — never deletes), then
      // advances ladder.state[taskId] so a step never re-fires. Per-task/per-step.
      if (raw.kind === "escalation_ladder") {
        const cfg = (raw.config as RuleConfig) ?? {};
        const ladder = cfg.ladder;
        const ladderTaskId = ladder?.scope?.taskId ?? (typeof taskId === "number" ? taskId : null);
        if (!ladder?.steps?.length || ladderTaskId == null) {
          await sb.from("automation_rules").update({ active: false, last_run_at: nowIso }).eq("id", raw.id as number);
          retired++; continue;
        }
        const { data: lt } = await sb.from("tasks").select("id,code,company_id,deadline,status,created_date,archived,owner_id").eq("id", ladderTaskId).maybeSingle();
        if (!lt || (lt as { archived?: boolean }).archived) {
          await sb.from("automation_rules").update({ active: false, last_run_at: nowIso }).eq("id", raw.id as number);
          retired++; continue;
        }
        const lrow = lt as Record<string, unknown>;
        // Keep scope.taskId populated so the pure layer can read state[taskId].
        const evalCfg: RuleConfig = { ...cfg, ladder: { ...ladder, scope: { ...(ladder.scope ?? {}), taskId: ladderTaskId } } };
        const rule: AutomationRuleRow = {
          id: raw.id as number, kind: "escalation_ladder", config: evalCfg,
          active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
        };
        const evalRes = evaluateRule(rule, { deadline: d(lrow.deadline), status: lrow.status as string, createdDate: d(lrow.created_date) }, await lastUpdateAt(ladderTaskId), now);
        evaluated++;
        const patch: Record<string, unknown> = { last_run_at: nowIso };
        if (evalRes.deactivate) { patch.active = false; retired++; }
        if (evalRes.fire && evalRes.ladderStep) {
          fired++;
          patch.last_fired_at = nowIso;
          const step = ladder.steps[evalRes.ladderStep.index];
          const code = lrow.code as string;
          const companyId = (lrow.company_id as number | null) ?? null;
          try {
            const ctx = await escalationContext(ladderTaskId, now);
            const overdueDays = evalRes.ladderStep.overdueDays;
            const title = `Escalation: ${code} (${overdueDays}d overdue)`;
            const body = `${code} is ${overdueDays} day(s) overdue.${ctx}`;
            const recipients = new Set<string>();
            if (step.notifyOwner) recipients.add("admin");
            if (step.warnPerson && typeof lrow.owner_id === "number") recipients.add(personRecipient(lrow.owner_id as number));
            if (step.notifyManagers && typeof lrow.owner_id === "number") for (const id of await managersOf(lrow.owner_id as number)) recipients.add(personRecipient(id));
            if (step.notifyDirectors) {
              const ids = companyId != null ? await directorsOfCompany(companyId) : await allDirectors();
              for (const id of ids) recipients.add(personRecipient(id));
            }
            for (const r of recipients) {
              await createNotification({ recipient: r, kind: "assigned", taskId: ladderTaskId, taskCode: code, title, body, actor: "ORI" });
            }
            // Optional reversible auto-escalate (status write, audited — never deletes).
            if (step.autoEscalate && (lrow.status as string) !== "Escalated") {
              const prevStatus = lrow.status as string;
              await sb.from("tasks").update({ status: "Escalated", escalation: "Yes", last_updated_at: nowIso }).eq("id", ladderTaskId);
              await sb.from("audit_log").insert({ task_id: ladderTaskId, task_code: code, company_id: companyId, entry_type: "UPDATE", field: "Status", old_value: prevStatus, new_value: "Escalated", change_reason: `ORI escalation ladder (${overdueDays}d overdue)`, created_at: nowIso, created_by: "ai-command" });
              void reindexEntity("task", ladderTaskId);
            }
          } catch (actErr) {
            await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: "escalation_ladder" });
          }
          // Advance per-task state so this step (and lower) never re-fires.
          const state = { ...(ladder.state ?? {}), [String(ladderTaskId)]: evalRes.ladderStep.overdueDays };
          patch.config = { ...cfg, ladder: { ...ladder, state } };
        }
        await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
        continue;
      }

      if (!taskId) continue;
      const { data: task } = await sb.from("tasks").select("id,code,company_id,deadline,status,created_date,archived").eq("id", taskId).maybeSingle();
      if (!task || (task as { archived?: boolean }).archived) {
        await sb.from("automation_rules").update({ active: false, last_run_at: nowIso }).eq("id", raw.id as number);
        retired++; continue;
      }
      const t = task as Record<string, unknown>;
      const rule: AutomationRuleRow = {
        id: raw.id as number, kind: raw.kind as RuleKind, config: (raw.config as Record<string, unknown>) ?? {},
        active: true, done: false, createdAt: d(raw.created_at)!, lastFiredAt: d(raw.last_fired_at),
      };
      const evalRes = evaluateRule(
        rule,
        { deadline: d(t.deadline), status: t.status as string, createdDate: d(t.created_date) },
        await lastUpdateAt(taskId),
        now,
      );
      evaluated++;

      const patch: Record<string, unknown> = { last_run_at: nowIso };
      if (evalRes.deactivate) { patch.active = false; retired++; }
      if (evalRes.markDone) patch.done = true;

      if (evalRes.fire) {
        patch.last_fired_at = nowIso;
        fired++;
        const code = t.code as string;
        try {
          if (rule.kind === "reminder_before_deadline" || rule.kind === "nudge_until_update") {
            const label = rule.kind === "reminder_before_deadline" ? "Deadline reminder" : "Please post an update";
            const body = rule.kind === "reminder_before_deadline" ? "This task is due soon — please make sure it's on track." : "This task needs a progress update.";
            const targets = await assigneeIds(taskId);
            for (const pid of targets) {
              await createNotification({ recipient: personRecipient(pid), kind: "assigned", taskId, taskCode: code, title: `${label}: ${code}`, body, actor: "ORI" });
            }
            // Phase 6b: also send externally when the rule opted into email/WhatsApp
            // AND the owner has that channel's auto-send ON (guardrail; fails closed).
            await externalNotify(rule.config, targets, `${label}: ${code}`, body);
          } else if (rule.kind === "escalate_if_no_update") {
            await sb.from("tasks").update({ status: "Escalated", escalation: "Yes", last_updated_at: nowIso }).eq("id", taskId);
            void reindexEntity("task", taskId);
            const toId = rule.config.escalateToPersonId;
            const ctx = await escalationContext(taskId, now);
            const escBody = `No update was posted in time, so ORI escalated this to you.${ctx}`;
            if (typeof toId === "number") {
              await createNotification({ recipient: personRecipient(toId), kind: "assigned", taskId, taskCode: code, title: `Escalated: ${code}`, body: escBody, actor: "ORI" });
              await externalNotify(rule.config, [toId], `Escalated: ${code}`, escBody);
            }
            await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI escalated ${code}`, body: `No update in the set window.${ctx}`, actor: "ORI" });
          } else if (rule.kind === "auto_close_stale") {
            // Close the stale task. Reversible: we log it to the audit trail with the
            // prior status so the owner can reopen; never a hard delete.
            const prevStatus = t.status as string;
            await sb.from("tasks").update({ status: "Closed", closed_date: nowIso, last_updated_at: nowIso }).eq("id", taskId);
            await sb.from("task_updates").insert({ task_id: taskId, body: `Auto-closed by ORI — no update in ${rule.config.staleDays ?? 7} day(s). Reopen if still live.`, created_at: nowIso, created_by: "ai-command" });
            await sb.from("audit_log").insert({ task_id: taskId, task_code: code, company_id: (t.company_id as number) ?? null, entry_type: "UPDATE", field: "Status", old_value: prevStatus, new_value: "Closed", change_reason: "ORI auto-close (stale)", created_at: nowIso, created_by: "ai-command" });
            void reindexEntity("task", taskId);
            await createNotification({ recipient: "admin", kind: "assigned", taskId, taskCode: code, title: `ORI closed ${code}`, body: `Auto-closed — untouched for ${rule.config.staleDays ?? 7} day(s).`, actor: "ORI" });
          } else if (rule.kind === "auto_reassign_on_leave") {
            await coverTaskOnLeave(taskId, code, t.company_id as number | null, rule.config, nowIso);
          } else if (rule.kind === "create_event_after_deadline") {
            const cfg = rule.config;
            const deadline = d(t.deadline) ?? now;
            const dateStr = deadline.toISOString().slice(0, 10);
            const allDay = !cfg.time;
            const startAt = new Date(`${dateStr}T${allDay ? "09:00" : cfg.time}:00+03:00`);
            await createCalendarEvent({ title: cfg.title || `Follow-up: ${code}`, companyId: (t.company_id as number) ?? undefined, location: cfg.location, startAt, endAt: new Date(startAt.getTime() + 3_600_000), allDay, source: "manual", createdBy: "ai-command", taskId });
          }
        } catch (actErr) {
          await reportError(actErr, { route: "cron.ori-automations", ruleId: rule.id, kind: rule.kind });
        }
      }

      await sb.from("automation_rules").update(patch).eq("id", raw.id as number);
    }

  }

  // Built-in daily signal checks (own once/day dedupe; notify-only; fail-open). Each
  // is owner-toggle-able + threshold-configurable on the ORI Automation page; the
  // enabled flag is read inside the check (fail-open = on/default → today's behaviour).
  await checkUndecided(now);
  await checkQuietStaff(now);

  return { evaluated, fired, retired };
}

/**
 * Fire ONE rule immediately through the real fire path — used by the builder's
 * "send test" server action so the owner can preview a rule's output on demand.
 * For smart_reminder rules (digest + single) it invokes the same fireSmartDigest /
 * fireSmartReminder functions the cron uses, but bypasses the WHEN window + the
 * once-per-day dedupe so a test always produces something. All SAFETY is intact:
 * auto-act stays opt-in (actions.autoAct), external send stays guardrail-gated, and
 * digests remain notify-only. For any OTHER rule kind we clear the dedupe stamps and
 * run the normal single-rule sweep so it fires if genuinely due. Fail-open.
 */
export async function fireRuleNow(ruleId: number): Promise<{ ok: boolean; fired: number }> {
  try {
    const { data: raw } = await sb
      .from("automation_rules")
      .select("id,task_id,company_id,kind,config,active,done,created_at,last_fired_at")
      .eq("id", ruleId)
      .maybeSingle();
    if (!raw) return { ok: false, fired: 0 };
    const row = raw as Record<string, unknown>;
    const nowIso = new Date().toISOString();

    if (row.kind === "smart_reminder") {
      const cfg = (row.config as RuleConfig) ?? {};
      if (cfg.digest === true) {
        const matches = await resolveSmartDigestTasks(cfg, new Date());
        await fireSmartDigest(cfg, matches, nowIso);
        return { ok: true, fired: matches.length ? 1 : 0 };
      }
      const target = await resolveSmartTarget(cfg);
      await fireSmartReminder(cfg, target, nowIso);
      return { ok: true, fired: 1 };
    }

    // Other kinds: strip the dedupe so the real sweep will fire this one rule if due.
    const cfg = (row.config as RuleConfig) ?? {};
    const cleaned = { ...cfg }; delete (cleaned as Record<string, unknown>).lastFiredKey;
    await sb.from("automation_rules").update({ config: cleaned, last_fired_at: null }).eq("id", ruleId);
    const before = await runDueRules();
    return { ok: true, fired: before.fired };
  } catch (e) {
    await reportError(e, { route: "cron.ori-automations", step: "fireRuleNow", ruleId });
    return { ok: false, fired: 0 };
  }
}

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const { evaluated, fired, retired } = await runDueRules();
    await recordEvent("cron.ori-automations", "ok", { evaluated, fired, retired });
    return NextResponse.json({ ok: true, evaluated, fired, retired });
  } catch (err) {
    await reportError(err, { route: "cron.ori-automations" });
    await recordEvent("cron.ori-automations", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "ORI automation run failed." }, { status: 500 });
  }
}
