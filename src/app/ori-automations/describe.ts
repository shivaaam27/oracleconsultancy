import "server-only";
import {
  Eye, BellRing, MessageSquareWarning, ArrowUpCircle, CalendarPlus,
  Repeat, PlaySquare, DoorClosed, UserCog, Cog, ListChecks, type LucideIcon,
} from "lucide-react";

// Turns a raw automation_rules row into a plain-language card for the management
// screen. Every `kind` ORI can hold (the event-driven "watch" rules + the seven
// time-driven cron kinds) maps to a one-line description of exactly what it does,
// resolved against the names of the companies / people / tasks it references.

export type RawRule = {
  id: number;
  kind: string;
  config: Record<string, unknown> | null;
  task_id: number | null;
  company_id: number | null;
  active: boolean;
  done: boolean;
  created_at: string | null;
  last_fired_at: string | null;
  last_run_at: string | null;
};

/** Lookup dictionaries the describer resolves ids against (all optional). */
export type NameMaps = {
  companies: Map<number, string>;
  taskCodes: Map<number, string>;
  people: Map<number, string>;
};

export type DescribedRule = {
  id: number;
  kind: string;
  kindLabel: string;
  icon: LucideIcon;
  title: string;   // the plain-language "what it does"
  target: string;  // the scope line (task code / company / who's alerted)
  active: boolean;
  done: boolean;
  lastFired: string | null; // relative, e.g. "3 days ago"
  lastRun: string | null;   // relative — last time the rule was *evaluated* (may not have fired)
  createdAt: string | null;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  watch: { label: "Watcher", icon: Eye },
  reminder_before_deadline: { label: "Deadline reminder", icon: BellRing },
  nudge_until_update: { label: "Nudge", icon: MessageSquareWarning },
  escalate_if_no_update: { label: "Escalation", icon: ArrowUpCircle },
  create_event_after_deadline: { label: "Follow-up event", icon: CalendarPlus },
  auto_close_stale: { label: "Auto-close", icon: DoorClosed },
  auto_reassign_on_leave: { label: "Leave cover", icon: UserCog },
  recurring_task: { label: "Recurring task", icon: Repeat },
  scheduled_macro: { label: "Scheduled macro", icon: PlaySquare },
  smart_reminder: { label: "Smart reminder", icon: BellRing },
  escalation_ladder: { label: "Overdue ladder", icon: ListChecks },
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "3 days ago" / "just now" for a timestamp string, or null. */
export function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Map one raw rule → a described card. Never throws — an unknown kind falls back
 *  to a neutral "Custom automation" line rather than blowing up the page. */
export function describeRule(r: RawRule, maps: NameMaps): DescribedRule {
  const cfg = r.config ?? {};
  const meta = KIND_META[r.kind] ?? { label: "Custom automation", icon: Cog };
  const companyName = (id: number | null | undefined) => (id != null ? maps.companies.get(id) ?? null : null);
  const taskCode = (id: number | null | undefined) => (id != null ? maps.taskCodes.get(id) ?? null : null);
  const personName = (id: number | null | undefined) => (id != null ? maps.people.get(id) ?? null : null);

  const code = taskCode(r.task_id);
  let title = "";
  let target = "";

  switch (r.kind) {
    case "watch": {
      const label = str(cfg.label);
      const cond = str(cfg.condition);
      const value = str(cfg.value);
      const co = companyName(num(cfg.companyId));
      const scope = co ? `any ${co}` : "any";
      if (label) {
        title = label;
      } else if (cond === "task_status_becomes") {
        title = `Alert when ${scope} task becomes ${value || "a chosen status"}`;
      } else if (cond === "task_overdue") {
        title = `Alert when ${scope} task passes its deadline while still open`;
      } else if (cond === "document_expiring") {
        const days = num(cfg.daysBefore) ?? 14;
        title = `Alert when ${co ? `a ${co}` : "a"} document is within ${days} days of expiry`;
      } else {
        title = "Event watcher";
      }
      const who = personName(num(cfg.notifyPersonId));
      target = who ? `Alerts ${who}` : "Alerts you";
      break;
    }

    case "reminder_before_deadline": {
      const days = num(cfg.daysBefore) ?? 1;
      title = `Remind ${days} day${days === 1 ? "" : "s"} before ${code ?? "the task"}'s deadline`;
      target = code ? `Task ${code}` : "A task";
      break;
    }

    case "nudge_until_update": {
      const times = Array.isArray(cfg.times) && cfg.times.length ? (cfg.times as string[]).join(" & ") : "09:00 & 14:00";
      title = `Nudge for an update on ${code ?? "the task"} at ${times} until one is posted`;
      target = code ? `Task ${code}` : "A task";
      break;
    }

    case "escalate_if_no_update": {
      const days = num(cfg.afterDays) ?? 1;
      const to = personName(num(cfg.escalateToPersonId));
      title = `Escalate ${code ?? "the task"} if there's no update within ${days} day${days === 1 ? "" : "s"}`;
      target = to ? `Escalates to ${to}` : code ? `Task ${code}` : "A task";
      break;
    }

    case "create_event_after_deadline": {
      const evTitle = str(cfg.title);
      title = `Create a follow-up event once ${code ?? "the task"}'s deadline passes`;
      target = evTitle ? `Event: ${evTitle}` : code ? `Task ${code}` : "A task";
      break;
    }

    case "auto_close_stale": {
      const days = num(cfg.staleDays) ?? 7;
      const st = str(cfg.statusMatch);
      title = `Close ${code ?? "the task"} after ${days} day${days === 1 ? "" : "s"} with no update${st ? ` while it's ${st}` : ""}`;
      target = code ? `Task ${code}` : "A task";
      break;
    }

    case "auto_reassign_on_leave": {
      const fb = personName(num(cfg.fallbackPersonId));
      title = `Hand ${code ?? "the task"} to cover whenever its owner is on approved leave`;
      target = fb ? `Cover: ${fb}` : code ? `Task ${code}` : "A task";
      break;
    }

    case "recurring_task": {
      const co = companyName(num(cfg.companyId));
      const t = str(cfg.title) || "a task";
      const cadence = cfg.cadence === "monthly" ? "monthly" : "weekly";
      let when = "";
      if (cadence === "weekly") {
        const wd = num(cfg.weekday);
        when = `every ${wd != null ? WEEKDAYS[Math.min(6, Math.max(0, wd))] : "Monday"}`;
      } else {
        const dom = num(cfg.dayOfMonth) ?? 1;
        when = `on the ${ordinal(dom)} of each month`;
      }
      title = `Create "${t}" ${when}`;
      target = co ? `For ${co}` : "Recurring";
      break;
    }

    case "scheduled_macro": {
      const macro = str(cfg.macroName) || "a macro";
      const hour = num(cfg.hour);
      const hh = hour != null ? `${String(hour).padStart(2, "0")}:00` : "09:00";
      const monthly = num(cfg.dayOfMonth) != null && cfg.weekday == null;
      let when: string;
      if (monthly) {
        when = `on the ${ordinal(num(cfg.dayOfMonth) ?? 1)} of each month`;
      } else {
        const wd = num(cfg.weekday);
        when = `every ${wd != null ? WEEKDAYS[Math.min(6, Math.max(0, wd))] : "Monday"}`;
      }
      title = `Propose running the "${macro}" macro ${when} at ${hh}`;
      target = "Confirm-and-run (never auto-executes)";
      break;
    }

    case "smart_reminder": {
      const trig = (cfg.trigger ?? {}) as { byHour?: number; byMinute?: number; daysBeforeDeadline?: number; hoursBeforeDeadline?: number; onOverdue?: boolean };
      const scope = (cfg.scope ?? {}) as { personId?: number; companyId?: number; taskId?: number };
      const audience = (cfg.audience ?? {}) as { notifyOwner?: boolean; notifyDirectors?: boolean; notifyManagers?: boolean; warnPerson?: boolean; notifyPersonIds?: number[] };
      const actions = (cfg.actions ?? {}) as { autoAct?: boolean; postUpdate?: boolean; setStatus?: string; sendChannel?: string };
      const cond = str(cfg.condition) || "always";
      const digest = cfg.digest === true;

      const once = cfg.once === true;
      const hhmm = typeof trig.byHour === "number"
        ? `${String(Math.round(trig.byHour)).padStart(2, "0")}:${String(typeof trig.byMinute === "number" ? Math.round(trig.byMinute) : 0).padStart(2, "0")}`
        : null;

      // INTERVAL mode — a repeating nudge that stops on response.
      const everyMin = num(cfg.repeatEveryMinutes);
      let when: string;
      if (everyMin != null) {
        const everyStr = everyMin % 60 === 0 ? `every ${everyMin / 60}h` : `every ${everyMin} min`;
        const opener = hhmm ? `from ${hhmm}, ` : trig.onOverdue ? "once overdue, "
          : typeof trig.hoursBeforeDeadline === "number" ? `from ${trig.hoursBeforeDeadline}h before deadline, ` : "";
        const stops: string[] = [];
        if (cfg.untilUpdate === true) stops.push("until they update");
        if (cfg.untilDeadline === true) stops.push("until the deadline");
        const maxc = num(cfg.maxCount);
        if (maxc != null) stops.push(`up to ${maxc}×`);
        const win = cfg.window as { fromHour?: number; toHour?: number } | undefined;
        const winStr = win && typeof win.fromHour === "number" && typeof win.toHour === "number"
          ? ` (${String(win.fromHour).padStart(2, "0")}:00–${String(win.toHour).padStart(2, "0")}:00)` : "";
        when = `${opener}${everyStr} ${stops.join(", ")}${winStr}`;
      } else {
        when = hhmm
          ? (once ? `Today at ${hhmm}, once` : `At ${hhmm} daily`)
          : typeof trig.hoursBeforeDeadline === "number"
            ? `${trig.hoursBeforeDeadline} hour${trig.hoursBeforeDeadline === 1 ? "" : "s"} before the deadline${once ? ", once" : ""}`
          : typeof trig.daysBeforeDeadline === "number"
            ? `${trig.daysBeforeDeadline} day${trig.daysBeforeDeadline === 1 ? "" : "s"} before the deadline${once ? ", once" : ""}`
            : trig.onOverdue ? `Once overdue${once ? ", once" : ""}` : once ? "Once" : "Every day";
      }

      const scopeName = num(scope.taskId) != null ? (taskCode(num(scope.taskId)) ?? "one task")
        : num(scope.personId) != null ? (personName(num(scope.personId)) ?? "one person")
        : num(scope.companyId) != null ? (companyName(num(scope.companyId)) ?? "one company")
        : "everything";

      const agingDays = num(cfg.agingDays);
      const condText: Record<string, string> = {
        always: "",
        no_update_today: "if no update was posted today",
        overdue: "if it's overdue",
        due_tomorrow: digest ? "list every task due tomorrow" : "if it's due tomorrow",
        compliance_due_soon: "if a compliance date is approaching",
        waiting_external_aged: `if it's been Waiting External for ${agingDays ?? 3}+ days`,
        no_deadline_or_assignee: "if it has no deadline or nobody assigned",
        under_review_stale: `if it's sat Under Review for ${agingDays ?? 2}+ days`,
      };
      const bits = [when.toLowerCase(), condText[cond] ?? ""].filter(Boolean).join(", ");
      const suffixes: string[] = [];
      if (cfg.weekdaysOnly === true) suffixes.push("weekdays only");
      const pausedUntil = str(cfg.pausedUntil);
      if (pausedUntil && new Date(pausedUntil).getTime() > Date.now()) suffixes.push(`paused until ${pausedUntil.slice(0, 10)}`);
      const suffix = suffixes.length ? ` (${suffixes.join(", ")})` : "";
      title = `${bits.charAt(0).toUpperCase()}${bits.slice(1)} — watching ${scopeName}${digest ? " (one combined list)" : ""}${suffix}`;

      const who: string[] = [];
      if (audience.notifyOwner) who.push("you");
      if (audience.notifyDirectors) who.push("directors");
      if (audience.notifyManagers) who.push("managers");
      if (audience.warnPerson) who.push("the person");
      const extra = Array.isArray(audience.notifyPersonIds) ? audience.notifyPersonIds.length : 0;
      if (extra) who.push(`${extra} other${extra === 1 ? "" : "s"}`);
      const acts: string[] = [];
      if (actions.autoAct === true) {
        if (actions.postUpdate) acts.push("posts an update");
        if (actions.setStatus) acts.push(`sets status to ${actions.setStatus}`);
        if (actions.sendChannel) acts.push(`sends by ${actions.sendChannel}`);
      }
      target = [who.length ? `Notifies ${who.join(" + ")}` : "", acts.length ? `auto: ${acts.join(", ")}` : ""].filter(Boolean).join(" · ") || "Notify-only";
      break;
    }

    case "escalation_ladder": {
      const ladder = (cfg.ladder ?? {}) as {
        byHour?: number;
        scope?: { personId?: number; companyId?: number; taskId?: number };
        steps?: { overdueDays?: number; notifyOwner?: boolean; notifyDirectors?: boolean; notifyManagers?: boolean; warnPerson?: boolean; autoEscalate?: boolean }[];
      };
      const steps = Array.isArray(ladder.steps) ? [...ladder.steps].sort((a, b) => (a.overdueDays ?? 0) - (b.overdueDays ?? 0)) : [];
      const sc = ladder.scope ?? {};
      const scopeName = num(sc.taskId) != null ? (taskCode(num(sc.taskId)) ?? "one task")
        : num(sc.personId) != null ? (personName(num(sc.personId)) ?? "one person")
        : num(sc.companyId) != null ? (companyName(num(sc.companyId)) ?? "one company")
        : "every open task";
      const dayList = steps.map((s) => `day ${s.overdueDays ?? 0}`).join(" → ");
      title = `Escalate overdue tasks in steps${dayList ? ` (${dayList})` : ""} — watching ${scopeName}`;
      const autoStep = steps.find((s) => s.autoEscalate);
      target = `${steps.length} step${steps.length === 1 ? "" : "s"}${autoStep ? ` · auto-Escalate at day ${autoStep.overdueDays ?? 0}` : " · notify-only"}`;
      break;
    }

    default: {
      title = str((cfg as { title?: string }).title) || `Standing rule (${r.kind})`;
      target = code ? `Task ${code}` : companyName(r.company_id) ? `For ${companyName(r.company_id)}` : "Custom";
    }
  }

  return {
    id: r.id,
    kind: r.kind,
    kindLabel: meta.label,
    icon: meta.icon,
    title,
    target,
    active: r.active,
    done: r.done,
    lastFired: relativeTime(r.last_fired_at),
    lastRun: relativeTime(r.last_run_at),
    createdAt: r.created_at,
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
