import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, nowIso, resolveTask, resolvePerson, resolveCompany } from "@/lib/ori/tools";
import type { SmartActions, SmartAudience, SmartCondition, SmartScope, SmartTrigger, RuleConfig } from "@/lib/ori/automations";
import { MIN_REPEAT_MINUTES } from "@/lib/ori/automations";

/* create_smart_reminder — the ONE ORI tool for the conditional, time-of-day
 * "smart reminder" recipe (see automations.ts smart_reminder + the cron firing).
 *
 * Recipe: WHEN (byHour / daysBeforeDeadline / onOverdue) · IF (condition) · WHOSE
 * tasks (person / company / task scope) · WHO hears (owner / directors / the person
 * / extra people) · DO (audience-only, OR the OPT-IN auto-act: post an update, set a
 * status, send email/WhatsApp).
 *
 * TIER 3 — because it can AUTO-ACT (post/change/send with no human in the loop), so
 * the agent ALWAYS confirms it at creation. Auto-act DEFAULTS OFF: the owner must
 * clearly ask ORI to "post/update/change it automatically" for actions.autoAct to be
 * set. External send stays gated by canAutoSend() at fire time (fail-closed); the
 * rule never auto-deletes. Undo = delete the rule (ori.automation.create). */

const VALID_CONDITIONS: SmartCondition[] = ["no_update_today", "overdue", "compliance_due_soon", "always"];
const VALID_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];

function truthy(v: unknown): boolean {
  const s = str(v).toLowerCase();
  return v === true || ["1", "true", "yes", "on", "y"].includes(s);
}

/** Parse a clock-time string into hour+minute (24h, Dar-local). Accepts "11:45pm",
 *  "23:45", "11pm", "9.30am", "0930". Null when it isn't a time. */
export function parseClockTime(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?(am|pm)?$/.exec(s) ?? /^(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  const ap = m[3];
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (ap === "pm" && hour < 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { hour, minute };
}

/** Parse "every 6 hours" / "15 minutes" / "1h" / "90m" / "2 hrs" → minutes. Null when
 *  it isn't an interval. Bare numbers are read as minutes. */
export function parseRepeatInterval(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/^every\s+/, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|d|day|days)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "m";
  if (/^h/.test(unit)) return Math.round(n * 60);
  if (/^d/.test(unit)) return Math.round(n * 1440);
  return Math.round(n); // minutes (default)
}

export const SMART_TOOLS: ToolDef[] = [
  {
    name: "create_smart_reminder",
    tier: 3,
    description:
      "Set a SMART reminder: WHEN a time-of-day (minute-precise, e.g. '11:45pm'), a days/hours-before-deadline window or overdue is reached, IF a condition holds, notify a chosen audience via portal push (you, directors, the person, named people — the person is the default for 'remind X …'), and OPTIONALLY (opt-in only) auto-act — post an update on the task, change its status, or send email/WhatsApp. A specific clock time or hours-before-deadline is a ONE-OFF by default (retires after firing); daily/every = recurring. For HIGH-FREQUENCY REPEATING nudges that STOP when the person responds ('ping every 6 hours until they post an update', 'every 15 min until they respond', 'from 3h before the deadline, every hour until due or they update'), set repeatEvery (min 15 minutes) plus a stop condition (untilUpdate is the default; untilDeadline; or maxCount). Compose with the WHEN triggers (onOverdue / hoursBeforeDeadline / byHour) to open the nagging window. Auto-act is OFF unless the owner clearly says to do it automatically. Always confirmed before it's created.",
    params: {
      person: { type: "string", required: false, description: "WHOSE tasks — a person by name (scope). Give a person, company or taskCode." },
      company: { type: "string", required: false, description: "WHOSE tasks — a company by name (scope)." },
      taskCode: { type: "string", required: false, description: "WHOSE task — a specific task code (scope)." },
      byHour: { type: "number", required: false, description: "WHEN — fire once this hour of day (0–23, Dar es Salaam) is reached, e.g. 11 for 11am." },
      time: { type: "string", required: false, description: "WHEN — an exact clock time like '11:45pm' or '23:45' (minute precision; preferred over byHour when the owner names a specific time)." },
      daysBeforeDeadline: { type: "number", required: false, description: "WHEN — fire this many days before the task's deadline." },
      hoursBeforeDeadline: { type: "number", required: false, description: "WHEN — fire this many hours before the task's deadline (e.g. 1 for 'one hour before it's due'; fractional ok)." },
      onOverdue: { type: "string", required: false, description: "WHEN — 'yes' to fire only once the task is overdue." },
      once: { type: "string", required: false, description: "One-off vs recurring — 'yes' fires ONCE then retires; 'no' repeats. DEFAULTS to yes when a specific clock time or hoursBeforeDeadline is given ('at 11:45pm' means once); say daily/every for recurring." },
      repeatEvery: { type: "string", required: false, description: "HIGH-FREQUENCY REPEAT — e.g. 'every 6 hours', '15 minutes', '1 hour'. When set, the reminder REPEATS on that interval (minimum 15 minutes) until a stop condition, instead of once a day. Use for 'ping every 6 hours until they update'." },
      untilUpdate: { type: "string", required: false, description: "STOP — 'yes' to stop repeating the moment the person posts an update on the task. This is the DEFAULT stop when a repeat interval + a task/person scope is given." },
      untilDeadline: { type: "string", required: false, description: "STOP — 'yes' to stop repeating once the task's deadline passes." },
      maxCount: { type: "number", required: false, description: "STOP — stop after this many reminders (1–100)." },
      activeFromHour: { type: "number", required: false, description: "Active-hours start (0–23, Dar es Salaam) — a repeating nudge only fires from this hour, so it never pings overnight. Pair with activeToHour." },
      activeToHour: { type: "number", required: false, description: "Active-hours end (0–23, Dar es Salaam) — a repeating nudge only fires before this hour." },
      message: { type: "string", required: false, description: "The instruction/message wording — used as the notification text (and the posted update when auto-act posts one)." },
      condition: { type: "string", required: false, description: "IF — no_update_today | overdue | compliance_due_soon | always (default always)." },
      notifyOwner: { type: "string", required: false, description: "WHO — 'yes' to notify you (the owner/admin)." },
      notifyDirectors: { type: "string", required: false, description: "WHO — 'yes' to notify all directors." },
      warnPerson: { type: "string", required: false, description: "WHO — 'yes' to warn the scoped person." },
      notifyPeople: { type: "string[]", required: false, description: "WHO — extra people to notify, by name." },
      autoAct: { type: "string", required: false, description: "DO — 'yes' ONLY if the owner explicitly wants ORI to act automatically (default no = notify only)." },
      postUpdate: { type: "string", required: false, description: "DO (auto-act) — 'yes' to post an update on the task automatically." },
      updateText: { type: "string", required: false, description: "DO — the text to post / the reminder wording." },
      setStatus: { type: "string", required: false, description: "DO (auto-act) — a status to move the task to automatically (e.g. Escalated)." },
      sendChannel: { type: "string", required: false, description: "DO (auto-act) — email | whatsapp to also send the person an external message (only if that channel's auto-send is ON)." },
    },
    async run(args) {
      // ── WHOSE (scope) — at least one of person / company / task ───────────────
      const scope: SmartScope = {};
      let scopeLabel = "";
      let companyId: number | null = null;
      if (str(args.taskCode)) {
        const t = await resolveTask(str(args.taskCode));
        if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
        scope.taskId = t.id; companyId = t.company_id; scopeLabel = t.code;
      }
      if (str(args.person)) {
        const p = await resolvePerson(str(args.person));
        if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
        scope.personId = p.id; scopeLabel = scopeLabel || p.name;
      }
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
        scope.companyId = c.id; companyId = companyId ?? c.id; scopeLabel = scopeLabel || c.name;
      }
      if (!scope.taskId && !scope.personId && !scope.companyId) {
        return { ok: false, message: "Whose tasks should this watch — a person, a company, or a specific task?" };
      }

      // ── WHEN (trigger) ────────────────────────────────────────────────────────
      const trigger: SmartTrigger = {};
      const clock = str(args.time) ? parseClockTime(str(args.time)) : null;
      if (clock) {
        trigger.byHour = clock.hour;
        if (clock.minute > 0) trigger.byMinute = clock.minute;
      } else if (Number.isFinite(Number(args.byHour))) {
        trigger.byHour = Math.min(23, Math.max(0, Math.round(Number(args.byHour))));
      }
      if (Number.isFinite(Number(args.daysBeforeDeadline))) trigger.daysBeforeDeadline = Math.max(0, Math.round(Number(args.daysBeforeDeadline)));
      const hoursBefore = Number(args.hoursBeforeDeadline);
      if (Number.isFinite(hoursBefore) && hoursBefore > 0) trigger.hoursBeforeDeadline = Math.min(720, hoursBefore);
      if (truthy(args.onOverdue)) trigger.onOverdue = true;

      // ── REPEAT interval (high-frequency nudge that stops on response) ──────────
      const repeatMin = str(args.repeatEvery) ? parseRepeatInterval(str(args.repeatEvery)) : null;
      const isInterval = repeatMin != null;

      // ONE-OFF vs recurring: an explicit `once` wins; otherwise a specific clock
      // time or an hours-before-deadline window reads as a one-off ("at 11:45pm"
      // means tonight, not every night). A repeat interval is never a one-off.
      const once = isInterval ? false
        : args.once != null && str(args.once) !== ""
          ? truthy(args.once)
          : !!clock || trigger.hoursBeforeDeadline != null;

      // ── IF (condition) ────────────────────────────────────────────────────────
      const condRaw = str(args.condition) as SmartCondition;
      const condition: SmartCondition = VALID_CONDITIONS.includes(condRaw) ? condRaw : "always";

      // ── WHO (audience) — must reach someone ────────────────────────────────────
      const audience: SmartAudience = {};
      if (truthy(args.notifyOwner)) audience.notifyOwner = true;
      if (truthy(args.notifyDirectors)) audience.notifyDirectors = true;
      if (truthy(args.warnPerson)) audience.warnPerson = true;
      const extra = Array.isArray(args.notifyPeople) ? (args.notifyPeople as unknown[]) : [];
      const extraIds: number[] = [];
      const extraNames: string[] = [];
      for (const n of extra) { const p = await resolvePerson(str(n)); if (p) { extraIds.push(p.id); extraNames.push(p.name); } }
      if (extraIds.length) audience.notifyPersonIds = extraIds;

      // ── DO (actions) — auto-act OPT-IN ONLY (default OFF) ──────────────────────
      const actions: SmartActions = {};
      const wantAuto = truthy(args.autoAct);
      const messageText = str(args.updateText) || str(args.message);
      if (messageText) actions.updateText = messageText;
      if (wantAuto) {
        actions.autoAct = true;
        if (truthy(args.postUpdate)) actions.postUpdate = true;
        const setStatus = str(args.setStatus);
        if (VALID_STATUSES.includes(setStatus)) actions.setStatus = setStatus;
        const ch = str(args.sendChannel).toLowerCase();
        if (ch === "email" || ch === "whatsapp") actions.sendChannel = ch;
      }
      // If auto-act is on but the owner named no concrete action, default to a gentle
      // posted update (the safest of the three; still guardrail-free = internal).
      if (actions.autoAct && !actions.postUpdate && !actions.setStatus && !actions.sendChannel) {
        actions.postUpdate = true;
      }

      // DEFAULT audience: "remind Shivam at 11:45pm, push notification" means a
      // portal push to THAT person — so when nobody was named and the rule is
      // scoped to a person, warn them.
      if (!audience.notifyOwner && !audience.notifyDirectors && !audience.warnPerson && !extraIds.length && typeof scope.personId === "number") {
        audience.warnPerson = true;
      }
      // A rule that neither notifies anyone NOR auto-acts is a no-op — refuse.
      if (!audience.notifyOwner && !audience.notifyDirectors && !audience.warnPerson && !extraIds.length && !actions.autoAct) {
        return { ok: false, message: "Who should hear about this — you, the directors, the person, or someone named? (Or should ORI act on it automatically?)" };
      }

      // ── Assemble interval fields + enforce SAFETY: a repeat rule MUST have a stop.
      const intervalCfg: Partial<RuleConfig> = {};
      if (isInterval) {
        intervalCfg.repeatEveryMinutes = Math.max(MIN_REPEAT_MINUTES, repeatMin!);
        const scoped = typeof scope.taskId === "number" || typeof scope.personId === "number";
        // untilUpdate is the DEFAULT stop when a repeat + a task/person scope is given.
        const wantUntilUpdate = args.untilUpdate != null && str(args.untilUpdate) !== ""
          ? truthy(args.untilUpdate)
          : scoped && !truthy(args.untilDeadline) && !Number.isFinite(Number(args.maxCount));
        if (wantUntilUpdate) intervalCfg.untilUpdate = true;
        if (truthy(args.untilDeadline)) intervalCfg.untilDeadline = true;
        const maxCount = Number(args.maxCount);
        if (Number.isFinite(maxCount) && maxCount >= 1) intervalCfg.maxCount = Math.min(100, Math.round(maxCount));
        // Active-hours window (never nag overnight).
        const fromH = Number(args.activeFromHour), toH = Number(args.activeToHour);
        if (Number.isInteger(fromH) && Number.isInteger(toH) && fromH >= 0 && fromH <= 23 && toH >= 0 && toH <= 23 && fromH !== toH) {
          intervalCfg.window = { fromHour: fromH, toHour: toH };
        }
        if (!intervalCfg.untilUpdate && !intervalCfg.untilDeadline && intervalCfg.maxCount == null) {
          return { ok: false, message: "A repeating reminder needs a stop condition — should it stop when they post an update, when the deadline passes, or after a set number of reminders?" };
        }
      }

      const config = { trigger, condition, scope, audience, actions, ...intervalCfg, ...(once ? { once: true } : {}) };
      const { data, error } = await sb.from("automation_rules").insert({
        task_id: scope.taskId ?? null, company_id: companyId, kind: "smart_reminder", config,
        active: true, done: false, created_by: "ai-command", created_at: nowIso(),
      }).select("id").single();
      if (error || !data) return { ok: false, message: "Couldn't save that smart reminder." };

      // Human-readable confirmation — spell out the auto-act explicitly.
      const whenBits: string[] = [];
      if (trigger.byHour != null) whenBits.push(`at ${String(trigger.byHour).padStart(2, "0")}:${String(trigger.byMinute ?? 0).padStart(2, "0")}`);
      if (trigger.daysBeforeDeadline != null) whenBits.push(`${trigger.daysBeforeDeadline}d before deadline`);
      if (trigger.hoursBeforeDeadline != null) whenBits.push(`${trigger.hoursBeforeDeadline}h before deadline`);
      if (trigger.onOverdue) whenBits.push("once overdue");
      let when: string;
      if (isInterval) {
        const mins = intervalCfg.repeatEveryMinutes!;
        const everyStr = mins % 60 === 0 ? `every ${mins / 60}h` : `every ${mins} min`;
        const stops: string[] = [];
        if (intervalCfg.untilUpdate) stops.push("until they post an update");
        if (intervalCfg.untilDeadline) stops.push("until the deadline");
        if (intervalCfg.maxCount != null) stops.push(`up to ${intervalCfg.maxCount} times`);
        const openBits = whenBits.length ? `from ${whenBits.join(" then ")}, ` : "";
        when = `${openBits}${everyStr} ${stops.join(", ")}`;
      } else {
        when = (whenBits.length ? whenBits.join(" then ") : "each day") + (once ? ", once" : "");
      }
      const whoBits: string[] = [];
      if (audience.notifyOwner) whoBits.push("you");
      if (audience.notifyDirectors) whoBits.push("directors");
      if (audience.warnPerson) whoBits.push("the person");
      if (extraNames.length) whoBits.push(extraNames.join(", "));
      const who = whoBits.length ? `notify ${whoBits.join(", ")}` : "";
      const doBits: string[] = [];
      if (actions.autoAct && actions.postUpdate) doBits.push("auto-post an update");
      if (actions.autoAct && actions.setStatus) doBits.push(`set status to ${actions.setStatus}`);
      if (actions.autoAct && actions.sendChannel) doBits.push(`send by ${actions.sendChannel} (if auto-send is on)`);
      const act = doBits.length ? ` and AUTOMATICALLY ${doBits.join(", ")}` : "";
      const sep = who && act ? " —" : "";

      return {
        ok: true,
        message: `Smart reminder set for ${scopeLabel}: ${when}, if ${condition.replace(/_/g, " ")}, ${who}${sep}${act}.`,
        redirect: scope.taskId ? undefined : "/settings",
        undo: { kind: "ori.automation.create", payload: { ruleId: data.id as number } },
      };
    },
  },
];
