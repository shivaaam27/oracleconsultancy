"use server";

// Server actions for the ORI Automation management screen: pause/cancel an
// existing standing rule, plus the RULE BUILDER's create action. The builder is
// the owner's self-serve WHEN/IF/WHO/DO form — everything is re-validated here
// server-side (ids resolved against the DB, enums checked, auto-act stays an
// explicit opt-in) before a single insert into `automation_rules`.

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { STATUSES } from "@/lib/constants";
import { saveAppSettings } from "@/lib/settings";
import { MIN_REPEAT_MINUTES } from "@/lib/ori/automations";
import type { RuleConfig, SmartCondition } from "@/lib/ori/automations";

type Res = { ok: boolean; error?: string };

/* ── Rule builder ─────────────────────────────────────────────────────── */

/** One rung of an escalation ladder (client shape — re-validated server-side). */
export type LadderStepInput = {
  overdueDays: number;
  notifyOwner?: boolean;
  notifyDirectors?: boolean;
  notifyManagers?: boolean;
  warnPerson?: boolean;
  autoEscalate?: boolean;
};

export type BuilderPayload = {
  when?: { mode: "at_hour" | "days_before" | "hours_before" | "on_overdue" | "daily"; hour?: number; minute?: number; days?: number; hoursBefore?: number };
  /** One-off — fires a single time then the rule retires itself. */
  once?: boolean;
  condition?: SmartCondition;
  scope?: { type: "everyone" | "person" | "company" | "task"; personId?: number; companyId?: number; taskCode?: string };
  audience?: { notifyOwner: boolean; notifyDirectors: boolean; notifyManagers?: boolean; warnPerson: boolean; extraPersonIds: number[] };
  actions?: { autoAct: boolean; postUpdate?: boolean; updateText?: string; setStatus?: string; sendChannel?: "email" | "whatsapp" };
  /** Extra scheduling controls (all optional). */
  weekdaysOnly?: boolean;
  pausedUntil?: string;   // "YYYY-MM-DD" — rule idle before this date
  agingDays?: number;     // threshold for the *_aged / *_stale conditions
  /** High-frequency repeating nudge that stops on response (INTERVAL mode). When set,
   *  the smart_reminder repeats every `everyMinutes` (min 15) until a stop condition. */
  repeat?: {
    everyMinutes: number;
    untilUpdate?: boolean;
    untilDeadline?: boolean;
    maxCount?: number;
    window?: { fromHour: number; toHour: number };
  };
  /** Escalation-ladder path — when set, builds an `escalation_ladder` rule instead. */
  ladder?: { byHour?: number; steps: LadderStepInput[] };
  /** Recurring-task path — when set, builds a `recurring_task` rule instead (a fresh
   *  task created on a cadence, complete with its own template — not tied to WHEN/IF/
   *  WHO/DO, which describe reminders about an EXISTING task). */
  recurring?: {
    cadence: "weekly" | "monthly";
    weekdays?: number[]; // 0=Sun … 6=Sat — weekly only, at least one required
    dayOfMonth?: number; // 1–31 — monthly only
    companyId: number;
    title: string;
    priority?: string;
    status?: string; // open statuses only — never Completed/Closed on creation
    description?: string;
    assigneePersonIds?: number[];
  };
  /** Template hint: use a simpler existing kind when the recipe fits it. Honoured
   *  only when its requirements are met; otherwise falls back to smart_reminder. */
  preferKind?: "reminder_before_deadline" | "escalate_if_no_update";
};

// Open (non-terminal) statuses — a recurring task is never created straight into
// Completed/Closed; a fresh occurrence is always open work.
const OPEN_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];

const CONDITIONS: SmartCondition[] = [
  "always", "no_update_today", "overdue", "due_tomorrow", "compliance_due_soon",
  "waiting_external_aged", "no_deadline_or_assignee", "under_review_stale",
];

/** Validate a "YYYY-MM-DD" string → a real, parseable date. */
function validDateStr(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = new Date(`${t}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? t : null;
}

/** Conditions that read the `agingDays` threshold. */
function agingCond(cond: SmartCondition): boolean {
  return cond === "waiting_external_aged" || cond === "under_review_stale";
}
/** Clamp the aging threshold (1–90) with sensible per-condition defaults. */
function clampAging(v: unknown, cond: SmartCondition): number {
  const def = cond === "under_review_stale" ? 2 : 3;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(90, n));
}

/** Validate + normalise a repeat (interval) block. Returns the config fragment, or
 *  an error string when a repeat rule lacks a stop condition / has bad hours. Enforces
 *  the 15-minute floor, maxCount 1–100, and window hours 0–23. */
function buildRepeat(r: NonNullable<BuilderPayload["repeat"]>): { cfg: Partial<RuleConfig> } | { error: string } {
  const everyMinutes = Math.round(Number(r.everyMinutes));
  if (!Number.isFinite(everyMinutes) || everyMinutes < MIN_REPEAT_MINUTES) {
    return { error: `The repeat interval must be at least ${MIN_REPEAT_MINUTES} minutes.` };
  }
  const cfg: Partial<RuleConfig> = { repeatEveryMinutes: everyMinutes };
  if (r.untilUpdate === true) cfg.untilUpdate = true;
  if (r.untilDeadline === true) cfg.untilDeadline = true;
  if (r.maxCount != null) {
    const n = Math.round(Number(r.maxCount));
    if (!Number.isFinite(n) || n < 1 || n > 100) return { error: "The reminder count must be between 1 and 100." };
    cfg.maxCount = n;
  }
  if (r.window) {
    const from = Math.round(Number(r.window.fromHour)), to = Math.round(Number(r.window.toHour));
    if (![from, to].every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) return { error: "Active hours must be between 0 and 23." };
    if (from !== to) cfg.window = { fromHour: from, toHour: to };
  }
  // SAFETY: a repeat rule MUST carry at least one stop condition.
  if (!cfg.untilUpdate && !cfg.untilDeadline && cfg.maxCount == null) {
    return { error: "A repeating reminder must have a stop: until they update, until the deadline, or a maximum count." };
  }
  return { cfg };
}

/** Create one automation rule from the self-serve builder. Never trusts the
 *  client: every id is resolved against the DB, every enum checked, and the
 *  recipe must carry an audience or an (opt-in) auto-action to be saved. */
export async function createAutomationAction(p: BuilderPayload): Promise<Res> {
  try {
    // ── RECURRING TASK path ───────────────────────────────────────────────
    // A distinct recipe: create a brand-new task on a cadence, complete with its
    // own template. Not a WHEN/IF/WHO/DO reminder about an existing task, so it
    // skips that validation entirely.
    if (p.recurring) {
      const rc = p.recurring;
      const title = (rc.title ?? "").trim().slice(0, 300);
      if (!title) return { ok: false, error: "Give the recurring task a title." };
      const companyId = Number(rc.companyId);
      if (!Number.isInteger(companyId) || companyId <= 0) return { ok: false, error: "Pick a company." };
      const { data: comp } = await sb.from("companies").select("id").eq("id", companyId).maybeSingle();
      if (!comp) return { ok: false, error: "That company couldn't be found." };
      const cadence = rc.cadence === "monthly" ? "monthly" : "weekly";
      const config: RuleConfig = { cadence, companyId, title };
      if (cadence === "weekly") {
        const weekdays = [...new Set((rc.weekdays ?? []).map((n) => Math.round(Number(n))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
        if (weekdays.length === 0) return { ok: false, error: "Pick at least one day of the week." };
        config.weekdays = weekdays;
      } else {
        const dom = Math.round(Number(rc.dayOfMonth));
        config.dayOfMonth = Number.isInteger(dom) ? Math.min(31, Math.max(1, dom)) : 1;
      }
      config.priority = ["Critical", "High", "Medium", "Low"].includes(String(rc.priority)) ? String(rc.priority) : "Medium";
      config.status = OPEN_STATUSES.includes(String(rc.status)) ? String(rc.status) : "Not Started";
      const description = (rc.description ?? "").trim();
      if (description) config.description = description.slice(0, 2000);
      const assigneeIds = [...new Set((rc.assigneePersonIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
      if (assigneeIds.length) {
        const { data } = await sb.from("people").select("id").in("id", assigneeIds);
        if ((data ?? []).length !== assigneeIds.length) return { ok: false, error: "One of the assignees couldn't be found." };
        config.assigneePersonIds = assigneeIds;
      }
      const { error } = await sb.from("automation_rules").insert({
        kind: "recurring_task", task_id: null, company_id: companyId,
        config, active: true, done: false, created_by: "web-ui", created_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: "Could not save the automation." };
      revalidatePath("/ori-automations");
      return { ok: true };
    }

    // WHEN
    const mode = p?.when?.mode;
    if (!mode || !["at_hour", "days_before", "hours_before", "on_overdue", "daily"].includes(mode)) return { ok: false, error: "Pick when it should fire." };
    let hour: number | undefined;
    let minute: number | undefined;
    if (mode === "at_hour") {
      hour = Number(p.when?.hour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, error: "The hour must be between 0 and 23." };
      const m = p.when?.minute == null ? 0 : Number(p.when.minute);
      if (!Number.isInteger(m) || m < 0 || m > 59) return { ok: false, error: "The minute must be between 0 and 59." };
      minute = m;
    }
    let days: number | undefined;
    if (mode === "days_before") {
      days = Number(p.when?.days);
      if (!Number.isInteger(days) || days < 0 || days > 365) return { ok: false, error: "Days before the deadline must be 0–365." };
    }
    let hoursBefore: number | undefined;
    if (mode === "hours_before") {
      hoursBefore = Number(p.when?.hoursBefore);
      if (!Number.isFinite(hoursBefore) || hoursBefore <= 0 || hoursBefore > 720) return { ok: false, error: "Hours before the deadline must be 1–720." };
    }
    const once = p.once === true;

    // IF
    if (!p.condition || !CONDITIONS.includes(p.condition)) return { ok: false, error: "Pick a valid condition." };

    // DO
    const act = p?.actions ?? { autoAct: false };
    const autoAct = act.autoAct === true; // explicit opt-in only
    let setStatus: string | undefined;
    if (autoAct && act.setStatus) {
      if (!STATUSES.includes(act.setStatus)) return { ok: false, error: "That status isn't one of the known statuses." };
      setStatus = act.setStatus;
    }
    const sendChannel = autoAct && (act.sendChannel === "email" || act.sendChannel === "whatsapp") ? act.sendChannel : undefined;
    const postUpdate = autoAct && act.postUpdate === true;
    const updateText = typeof act.updateText === "string" ? act.updateText.trim().slice(0, 500) : "";

    // WHO — scope (resolve every id against the DB; never trust the client).
    const scope: { personId?: number; companyId?: number; taskId?: number } = {};
    let taskId: number | null = null;
    let companyId: number | null = null;
    if (p.scope?.type === "person") {
      const pid = Number(p.scope.personId);
      if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: "Pick a person from the list." };
      const { data } = await sb.from("people").select("id").eq("id", pid).maybeSingle();
      if (!data) return { ok: false, error: "That person couldn't be found." };
      scope.personId = pid;
    } else if (p.scope?.type === "company") {
      const cid = Number(p.scope.companyId);
      if (!Number.isInteger(cid) || cid <= 0) return { ok: false, error: "Pick a company from the list." };
      const { data } = await sb.from("companies").select("id").eq("id", cid).maybeSingle();
      if (!data) return { ok: false, error: "That company couldn't be found." };
      scope.companyId = cid;
      companyId = cid;
    } else if (p.scope?.type === "task") {
      const code = (p.scope.taskCode ?? "").trim().toUpperCase();
      if (!code) return { ok: false, error: "Enter the task code (e.g. DS-003)." };
      const { data } = await sb.from("tasks").select("id,company_id").eq("code", code).maybeSingle();
      if (!data) return { ok: false, error: `No task with the code ${code} was found.` };
      scope.taskId = (data as { id: number }).id;
      taskId = scope.taskId;
      companyId = (data as { company_id: number | null }).company_id;
    } else if (p.scope?.type !== "everyone") {
      return { ok: false, error: "Pick who the rule watches." };
    }

    // ── ESCALATION LADDER path ────────────────────────────────────────────
    // A distinct kind: fires a rung when a task crosses each overdueDays step,
    // widening the audience with severity (and optionally auto-Escalating at the
    // top). Its audience is per-step, so it skips the single-audience gate below.
    if (p.ladder) {
      const byHourRaw = Number(p.ladder.byHour);
      const byHour = Number.isInteger(byHourRaw) && byHourRaw >= 0 && byHourRaw <= 23 ? byHourRaw : 9;
      const rawSteps = Array.isArray(p.ladder.steps) ? p.ladder.steps : [];
      const seen = new Set<number>();
      const steps = rawSteps
        .map((s) => ({
          overdueDays: Math.max(1, Math.min(365, Math.round(Number(s?.overdueDays)) || 0)),
          notifyOwner: s?.notifyOwner === true,
          notifyDirectors: s?.notifyDirectors === true,
          notifyManagers: s?.notifyManagers === true,
          warnPerson: s?.warnPerson === true,
          autoEscalate: s?.autoEscalate === true,
        }))
        .filter((s) => {
          if (s.overdueDays <= 0 || seen.has(s.overdueDays)) return false;
          seen.add(s.overdueDays);
          // Each rung must tell SOMEONE or auto-escalate — no silent rungs.
          return s.notifyOwner || s.notifyDirectors || s.notifyManagers || s.warnPerson || s.autoEscalate;
        })
        .sort((a, b) => a.overdueDays - b.overdueDays)
        .slice(0, 8);
      if (!steps.length) return { ok: false, error: "The ladder needs at least one step that notifies someone or auto-escalates." };

      const ladderConfig: RuleConfig = {
        ladder: {
          byHour,
          scope: Object.keys(scope).length ? scope : undefined,
          steps,
          state: {},
        },
        ...(p.weekdaysOnly === true ? { weekdaysOnly: true } : {}),
        ...(validDateStr(p.pausedUntil) ? { pausedUntil: validDateStr(p.pausedUntil)! } : {}),
      };
      const { error } = await sb.from("automation_rules").insert({
        kind: "escalation_ladder", task_id: taskId, company_id: companyId,
        config: ladderConfig, active: true, done: false, created_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: "Could not save the automation." };
      revalidatePath("/ori-automations");
      return { ok: true };
    }

    // WHO — audience (extra people must exist).
    const aud = p.audience ?? { notifyOwner: false, notifyDirectors: false, warnPerson: false, extraPersonIds: [] };
    const extraIds = [...new Set((aud.extraPersonIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
    if (extraIds.length) {
      const { data } = await sb.from("people").select("id").in("id", extraIds);
      if ((data ?? []).length !== extraIds.length) return { ok: false, error: "One of the extra people couldn't be found." };
    }
    if (aud.warnPerson && scope.personId == null) {
      return { ok: false, error: "“Warn the person” needs the rule scoped to a person." };
    }
    const notifyManagers = aud.notifyManagers === true;
    const hasAudience = aud.notifyOwner || aud.notifyDirectors || notifyManagers || (aud.warnPerson && scope.personId != null) || extraIds.length > 0;
    const hasAction = autoAct && (postUpdate || !!setStatus || !!sendChannel);
    if (!hasAudience && !hasAction) return { ok: false, error: "The rule must notify someone or (with auto-act on) do something." };

    // Prefer a simpler existing kind when the template recipe fits it exactly (never
    // for a repeat rule — those need the smart_reminder interval engine).
    if (!p.repeat && p.preferKind === "reminder_before_deadline" && taskId != null && mode === "days_before" && p.condition === "always" && !autoAct) {
      const { error } = await sb.from("automation_rules").insert({
        kind: "reminder_before_deadline", task_id: taskId, company_id: companyId,
        config: { daysBefore: days ?? 1 }, active: true, done: false, created_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: "Could not save the automation." };
      revalidatePath("/ori-automations");
      return { ok: true };
    }
    if (!p.repeat && p.preferKind === "escalate_if_no_update" && taskId != null && !autoAct) {
      const { error } = await sb.from("automation_rules").insert({
        kind: "escalate_if_no_update", task_id: taskId, company_id: companyId,
        config: { afterDays: days ?? 3 }, active: true, done: false, created_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: "Could not save the automation." };
      revalidatePath("/ori-automations");
      return { ok: true };
    }

    // smart_reminder — the general WHEN/IF/WHO/DO recipe.
    // Validate the repeat (interval) block if present — a repeat rule MUST have a stop.
    let repeatCfg: Partial<RuleConfig> = {};
    if (p.repeat) {
      const rr = buildRepeat(p.repeat);
      if ("error" in rr) return { ok: false, error: rr.error };
      repeatCfg = rr.cfg;
    }
    const config: RuleConfig = {
      trigger: mode === "at_hour" ? { byHour: hour, ...(minute ? { byMinute: minute } : {}) }
        : mode === "days_before" ? { daysBeforeDeadline: days }
        : mode === "hours_before" ? { hoursBeforeDeadline: hoursBefore }
        : mode === "on_overdue" ? { onOverdue: true }
        : {}, // "daily" — fires once per day, any tick
      condition: p.condition,
      scope,
      audience: {
        notifyOwner: aud.notifyOwner === true,
        notifyDirectors: aud.notifyDirectors === true,
        notifyManagers,
        warnPerson: aud.warnPerson === true && scope.personId != null,
        notifyPersonIds: extraIds,
      },
      actions: autoAct
        ? { autoAct: true, postUpdate, ...(updateText ? { updateText } : {}), ...(setStatus ? { setStatus } : {}), ...(sendChannel ? { sendChannel } : {}) }
        : { autoAct: false },
      // Interval mode wins over `once` (a repeat is never a one-off) and over digest.
      ...(repeatCfg.repeatEveryMinutes ? {} : (once ? { once: true } : {})),
      ...(repeatCfg.repeatEveryMinutes ? {} : (p.condition === "due_tomorrow" ? { digest: true } : {})),
      ...(p.weekdaysOnly === true ? { weekdaysOnly: true } : {}),
      ...(validDateStr(p.pausedUntil) ? { pausedUntil: validDateStr(p.pausedUntil)! } : {}),
      ...(agingCond(p.condition) ? { agingDays: clampAging(p.agingDays, p.condition) } : {}),
      ...repeatCfg,
    };
    const { error } = await sb.from("automation_rules").insert({
      kind: "smart_reminder", task_id: taskId, company_id: companyId,
      config, active: true, done: false, created_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: "Could not save the automation." };
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save the automation." };
  }
}

/* ── Built-in signals ─────────────────────────────────────────────────── */

/** The owner's on/off + threshold settings for the three hard-wired cron signals
 *  (quiet-staff, decision reminder, weekly health digest). Persisted to the same
 *  `settings` table via saveAppSettings — no migration. Days are clamped 1–120. */
export type SignalSettingsInput = {
  quietStaffEnabled: boolean;
  quietStaffDays: number;
  decisionReminderEnabled: boolean;
  decisionReminderDays: number;
  healthDigestEnabled: boolean;
};

function clampDays(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(120, n));
}

export async function saveSignalSettingsAction(p: SignalSettingsInput): Promise<Res> {
  try {
    await saveAppSettings({
      signalQuietStaffEnabled: p.quietStaffEnabled === true,
      signalQuietStaffDays: clampDays(p.quietStaffDays, 5),
      signalDecisionReminderEnabled: p.decisionReminderEnabled === true,
      signalDecisionReminderDays: clampDays(p.decisionReminderDays, 5),
      signalHealthDigestEnabled: p.healthDigestEnabled === true,
    });
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save the signal settings." };
  }
}

/** Best-effort fired-history for one rule: the most recent cron runs whose logged
 *  details mention this ruleId. Only fetched on demand (row expander), so a light
 *  scan of the last ~50 automation-cron events is cheap. Never throws. */
export async function ruleFiringsAction(id: number): Promise<{ at: string; note: string }[]> {
  if (!Number.isInteger(id) || id <= 0) return [];
  try {
    const { data } = await sb
      .from("system_events")
      .select("created_at,details")
      .eq("kind", "cron.ori-automations.rule")
      .order("created_at", { ascending: false })
      .limit(80);
    const rows = (data ?? []) as { created_at: string; details: string | null }[];
    const out: { at: string; note: string }[] = [];
    for (const r of rows) {
      if (out.length >= 6) break;
      let parsed: Record<string, unknown> | null = null;
      try { parsed = r.details ? JSON.parse(r.details) : null; } catch { parsed = null; }
      if (!parsed || Number(parsed.ruleId) !== id) continue;
      out.push({ at: r.created_at, note: typeof parsed.note === "string" ? parsed.note : "fired" });
    }
    return out;
  } catch {
    return [];
  }
}

/** Pause (active=false) or resume (active=true) one automation rule. Soft — the
 *  rule row is never deleted, so a paused rule can be switched straight back on.
 *  A resumed one-shot rule that had already fired (done=true) is left alone; only
 *  `active` is flipped, mirroring how the cron/watcher paths treat these rows. */
export async function toggleAutomationActive(id: number, active: boolean): Promise<Res> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Invalid rule." };
  try {
    const { error } = await sb
      .from("automation_rules")
      .update({ active })
      .eq("id", id);
    if (error) return { ok: false, error: "Could not update the automation." };
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update the automation." };
  }
}

/** Fire ONE rule immediately (the "Test now" button). Reuses the real cron fire
 *  path (fireRuleNow) so a test behaves exactly like a scheduled tick — same
 *  guardrails, same per-day/per-step dedupe. Notify-only rules just re-notify;
 *  auto-act rules do whatever their (opt-in) actions say, as they would live. */
export async function testAutomationAction(id: number): Promise<{ ok: boolean; fired: number; error?: string }> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, fired: 0, error: "Invalid rule." };
  try {
    const { fireRuleNow } = await import("@/app/api/cron/ori-automations/route");
    const res = await fireRuleNow(id);
    revalidatePath("/ori-automations");
    return { ok: res.ok, fired: res.fired };
  } catch {
    return { ok: false, fired: 0, error: "Could not run the test." };
  }
}

/** Cancel (retire) one automation rule. SOFT-deletes — mirrors deleteWatcher:
 *  we set active=false rather than hard-deleting, so an accidental cancel is
 *  recoverable and history is preserved. */
export async function cancelAutomation(id: number): Promise<Res> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Invalid rule." };
  try {
    const { error } = await sb
      .from("automation_rules")
      .update({ active: false })
      .eq("id", id);
    if (error) return { ok: false, error: "Could not cancel the automation." };
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not cancel the automation." };
  }
}
