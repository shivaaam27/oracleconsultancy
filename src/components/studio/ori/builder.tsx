"use client";

/**
 * The ORI rule builder in Studio (design/studio-mockup, board OriBuilder).
 *
 * The owner composes a standing rule as a plain WHEN / IF / WHO / DO recipe. A
 * dark band across the top always says, in one sentence, exactly what the rule
 * will do; the choices sit in two columns under it (When · If · Who | Steps ·
 * Schedule · Repeat · Do); Save stays off until the rule makes sense.
 *
 * ⚠️ RESTYLED, NOT REWIRED. The draft, the sentence, the coherence check and
 * the payload are the old builder's, line for line, and it saves through the
 * same `createAutomationAction`, which re-validates everything server-side.
 * Letting ORI act by itself stays an opt-in switch, off by default.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { FluidSelect } from "@/components/forms/fluid-select";
import { Combobox } from "@/components/forms/combobox";
import { DatePopover } from "@/components/forms/date-popover";
import { useToast } from "@/components/shell/toast";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { OriToggle } from "./toggle";
import { STATUSES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { createAutomationAction, type BuilderPayload } from "@/app/ori-automations/actions";

type NamedRow = { id: number; name: string };

/** One escalation-ladder rung in the form. */
type LadderStep = {
  overdueDays: number;
  notifyOwner: boolean;
  notifyManagers: boolean;
  notifyDirectors: boolean;
  warnPerson: boolean;
  autoEscalate: boolean;
};

const DEFAULT_LADDER: LadderStep[] = [
  { overdueDays: 1, notifyOwner: false, notifyManagers: false, notifyDirectors: false, warnPerson: true, autoEscalate: false },
  { overdueDays: 3, notifyOwner: false, notifyManagers: true, notifyDirectors: false, warnPerson: true, autoEscalate: false },
  { overdueDays: 5, notifyOwner: false, notifyManagers: true, notifyDirectors: true, warnPerson: true, autoEscalate: false },
  { overdueDays: 7, notifyOwner: true, notifyManagers: true, notifyDirectors: true, warnPerson: true, autoEscalate: true },
];

export type Draft = {
  whenMode: "at_hour" | "days_before" | "hours_before" | "on_overdue" | "daily" | "ladder" | "recurring";
  hour: number;
  minute: number;
  days: number;
  hoursBefore: number;
  once: boolean;
  // High-frequency repeating nudge that stops on response.
  repeatOn: boolean;
  repeatEvery: number;
  repeatUnit: "minutes" | "hours";
  stopUntilUpdate: boolean;
  stopUntilDeadline: boolean;
  stopMaxOn: boolean;
  stopMaxCount: number;
  activeHoursOn: boolean;
  activeFromHour: number;
  activeToHour: number;
  // The builder always initialises a condition ("always"); only the PAYLOAD may omit it
  // (recurring tasks carry no condition).
  condition: NonNullable<BuilderPayload["condition"]>;
  agingDays: number;
  weekdaysOnly: boolean;
  pausedUntil: string;
  /** The "Pause until…" chip is open (a date may not be picked yet). */
  pauseOpen: boolean;
  scopeType: "everyone" | "person" | "company" | "task";
  personName: string;
  companyName: string;
  taskCode: string;
  notifyOwner: boolean;
  notifyManagers: boolean;
  notifyDirectors: boolean;
  warnPerson: boolean;
  extraNames: string[];
  ladderSteps: LadderStep[];
  autoAct: boolean;
  postUpdate: boolean;
  updateText: string;
  setStatus: string;
  sendChannel: "" | "email" | "whatsapp";
  preferKind?: BuilderPayload["preferKind"];
  // ── Recurring task (a new task created on a cadence, not a reminder) ───────
  recurTitle: string;
  recurCompanyName: string;
  recurCadence: "weekly" | "monthly";
  recurWeekdays: number[]; // 0=Sun … 6=Sat, multi-select
  recurDayOfMonth: number;
  recurPriority: string;
  recurStatus: string;
  recurAssigneeNames: string[];
  recurDescription: string;
};

const BLANK: Draft = {
  whenMode: "at_hour", hour: 9, minute: 0, days: 2, hoursBefore: 1, once: false, condition: "always", agingDays: 3,
  repeatOn: false, repeatEvery: 6, repeatUnit: "hours",
  stopUntilUpdate: true, stopUntilDeadline: false, stopMaxOn: false, stopMaxCount: 10,
  activeHoursOn: false, activeFromHour: 8, activeToHour: 20,
  weekdaysOnly: false, pausedUntil: "", pauseOpen: false,
  scopeType: "everyone", personName: "", companyName: "", taskCode: "",
  notifyOwner: true, notifyManagers: false, notifyDirectors: false, warnPerson: false, extraNames: [],
  ladderSteps: DEFAULT_LADDER,
  autoAct: false, postUpdate: false, updateText: "", setStatus: "", sendChannel: "",
  recurTitle: "", recurCompanyName: "", recurCadence: "weekly", recurWeekdays: [1],
  recurDayOfMonth: 1, recurPriority: "Medium", recurStatus: "Not Started",
  recurAssigneeNames: [], recurDescription: "",
};

/** The starting draft: blank for "New automation", or a recipe laid over it
 *  (a recipe starts from "don't notify me" and switches on what it needs). */
export function draftFor(recipe: Partial<Draft> | null): Draft {
  return recipe ? { ...BLANK, notifyOwner: false, ...recipe } : BLANK;
}

const RECUR_PRIORITIES = ["Critical", "High", "Medium", "Low"];
// Open statuses only — a recurring task is never created straight into Completed/Closed.
const RECUR_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const DAY_CHIPS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

/** Which conditions read the aging-days threshold. */
const AGING_CONDS = new Set(["waiting_external_aged", "under_review_stale"]);

/* One-tap presets — each prefills the builder; the owner tweaks + saves. */
export const RECIPES: { label: string; hint: string; draft: Partial<Draft> }[] = [
  { label: "Owner morning brief", hint: "Today's tasks, to you at 8am", draft: { whenMode: "at_hour", hour: 8, condition: "due_tomorrow", scopeType: "everyone", notifyOwner: true } },
  { label: "Friday close-out", hint: "Open-vs-done this week, to you", draft: { whenMode: "at_hour", hour: 16, condition: "always", scopeType: "everyone", notifyOwner: true, weekdaysOnly: true } },
  { label: "11am accountability", hint: "No update by 11am → me + directors", draft: { whenMode: "at_hour", hour: 11, condition: "no_update_today", scopeType: "everyone", notifyOwner: true, notifyDirectors: true } },
  { label: "Overdue ladder", hint: "Day 1 → 3 → 5 → 7, widening", draft: { whenMode: "ladder", scopeType: "everyone", notifyOwner: false } },
  { label: "Manager team digest", hint: "One person's tasks → their manager", draft: { whenMode: "at_hour", hour: 9, condition: "always", scopeType: "person", notifyOwner: false, notifyManagers: true } },
  { label: "Director weekly pulse", hint: "A company's open tasks → directors", draft: { whenMode: "at_hour", hour: 9, condition: "always", scopeType: "company", notifyOwner: false, notifyDirectors: true, weekdaysOnly: true } },
  { label: "Staff personal plan", hint: "Warn a person of their open work", draft: { whenMode: "at_hour", hour: 9, condition: "always", scopeType: "person", notifyOwner: false, warnPerson: true } },
  { label: "Waiting-External ager", hint: "Stuck 3+ days waiting → me", draft: { whenMode: "at_hour", hour: 9, condition: "waiting_external_aged", agingDays: 3, scopeType: "everyone", notifyOwner: true } },
  { label: "Missing-deadline auditor", hint: "No deadline or assignee → me", draft: { whenMode: "at_hour", hour: 9, condition: "no_deadline_or_assignee", scopeType: "everyone", notifyOwner: true } },
  { label: "Under-review nudge", hint: "Sat in review 2+ days → me", draft: { whenMode: "at_hour", hour: 9, condition: "under_review_stale", agingDays: 2, scopeType: "everyone", notifyOwner: true } },
  { label: "Nag until they reply", hint: "Overdue → every 6h until they update", draft: { whenMode: "on_overdue", condition: "always", scopeType: "task", notifyOwner: false, warnPerson: true, repeatOn: true, repeatEvery: 6, repeatUnit: "hours", stopUntilUpdate: true, activeHoursOn: true } },
  { label: "Deadline crunch", hint: "3h before due → hourly until done", draft: { whenMode: "hours_before", hoursBefore: 3, condition: "always", scopeType: "task", notifyOwner: false, warnPerson: true, repeatOn: true, repeatEvery: 1, repeatUnit: "hours", stopUntilUpdate: true, stopUntilDeadline: true } },
  { label: "Escalation watchdog", hint: "One task — escalate on 3d silence", draft: { whenMode: "days_before", days: 3, condition: "no_update_today", scopeType: "task", notifyOwner: true, preferKind: "escalate_if_no_update" } },
  { label: "Remind before deadline", hint: "One task — 2 days ahead", draft: { whenMode: "days_before", days: 2, condition: "always", scopeType: "task", notifyOwner: true, preferKind: "reminder_before_deadline" } },
];

const COND_OPTIONS: { value: Draft["condition"]; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "no_update_today", label: "No update posted today" },
  { value: "overdue", label: "Task is overdue" },
  { value: "due_tomorrow", label: "Due tomorrow (one list)" },
  { value: "waiting_external_aged", label: "Waiting External too long" },
  { value: "under_review_stale", label: "Stuck Under Review" },
  { value: "no_deadline_or_assignee", label: "No deadline or assignee" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${pad(h)}:00` }));

const scopePhrase = (d: Draft): string =>
  d.scopeType === "person" ? (d.personName ? `${d.personName}'s tasks` : "one person's tasks")
    : d.scopeType === "company" ? (d.companyName ? `${d.companyName}'s tasks` : "one company's tasks")
    : d.scopeType === "task" ? (d.taskCode ? `task ${d.taskCode.toUpperCase()}` : "one task") : "all tasks";

const tail = (d: Draft): string => {
  const bits: string[] = [];
  if (d.once && d.whenMode !== "ladder") bits.push("just once — retires after firing");
  if (d.weekdaysOnly) bits.push("weekdays only");
  if (d.pausedUntil) bits.push(`paused until ${d.pausedUntil}`);
  return bits.length ? ` (${bits.join(", ")})` : "";
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "from once overdue, " — the WHEN that opens the nagging window for a repeat rule. */
function repeatPrefix(d: Draft): string {
  if (!d.repeatOn || d.whenMode === "ladder") return "";
  return d.whenMode === "at_hour" ? `from ${pad(d.hour)}:${pad(d.minute)}, `
    : d.whenMode === "hours_before" ? `from ${d.hoursBefore}h before the deadline, `
    : d.whenMode === "on_overdue" ? "once overdue, "
    : ""; // days_before / daily → no explicit opener
}

/** "every 6 hours until they post an update" — the repeat cadence + stop. Empty when
 *  repeat is off (or ladder). */
function repeatPhrase(d: Draft): string {
  if (!d.repeatOn || d.whenMode === "ladder") return "";
  const unit = d.repeatUnit === "hours" ? "hour" : "minute";
  const every = `every ${d.repeatEvery} ${unit}${d.repeatEvery === 1 ? "" : "s"}`;
  const stops: string[] = [];
  if (d.stopUntilUpdate) stops.push("until they post an update");
  if (d.stopUntilDeadline) stops.push("until the deadline");
  if (d.stopMaxOn) stops.push(`up to ${d.stopMaxCount} time${d.stopMaxCount === 1 ? "" : "s"}`);
  const inHours = d.activeHoursOn ? ` (only ${pad(d.activeFromHour)}:00–${pad(d.activeToHour)}:00)` : "";
  return `${every} ${stops.length ? stops.join(", ") : "with NO stop set"}${inHours}`;
}

const DAY_LABEL: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

/** The live plain-English sentence for the current draft. */
function sentence(d: Draft): string {
  if (d.whenMode === "recurring") {
    const title = d.recurTitle.trim() || "…";
    const co = d.recurCompanyName || "a company";
    const when = d.recurCadence === "monthly"
      ? `on the ${d.recurDayOfMonth}${d.recurDayOfMonth === 1 ? "st" : d.recurDayOfMonth === 2 ? "nd" : d.recurDayOfMonth === 3 ? "rd" : "th"} of each month`
      : d.recurWeekdays.length ? `every ${[...d.recurWeekdays].sort().map((w) => DAY_LABEL[w]).join(", ")}` : "…pick at least one day";
    const who = d.recurAssigneeNames.length ? `, assigned to ${d.recurAssigneeNames.join(", ")}` : "";
    return `Create "${title}" for ${co} ${when}${who}.`;
  }
  if (d.whenMode === "ladder") {
    const rungs = [...d.ladderSteps].sort((a, b) => a.overdueDays - b.overdueDays);
    const steps = rungs.map((s) => {
      const who: string[] = [];
      if (s.warnPerson) who.push("the assignee");
      if (s.notifyManagers) who.push("their manager");
      if (s.notifyDirectors) who.push("directors");
      if (s.notifyOwner) who.push("me");
      const act = [who.length ? `tell ${who.join(" + ")}` : "", s.autoEscalate ? "set status Escalated" : ""].filter(Boolean).join(" & ");
      return `day ${s.overdueDays}: ${act || "…"}`;
    }).join("; ");
    return `While ${scopePhrase(d)} stay overdue — ${steps || "add a step"}${tail(d)}.`;
  }
  const repeat = repeatPhrase(d);
  const when = repeat ? capitalise(repeatPrefix(d) + repeat)
    : d.whenMode === "at_hour" ? `At ${pad(d.hour)}:${pad(d.minute)}${d.once ? "" : " daily"}`
    : d.whenMode === "days_before" ? `${d.days} day${d.days === 1 ? "" : "s"} before the deadline`
    : d.whenMode === "hours_before" ? `${d.hoursBefore} hour${d.hoursBefore === 1 ? "" : "s"} before the deadline`
    : d.whenMode === "on_overdue" ? "Once a task goes overdue" : "Every day";
  const scope = scopePhrase(d);
  const cond = d.condition === "no_update_today" ? "if no update was posted today"
    : d.condition === "overdue" ? "if it's overdue"
    : d.condition === "due_tomorrow" ? "if tasks are due tomorrow"
    : d.condition === "waiting_external_aged" ? `if Waiting External for ${d.agingDays}+ days`
    : d.condition === "under_review_stale" ? `if Under Review for ${d.agingDays}+ days`
    : d.condition === "no_deadline_or_assignee" ? "if it has no deadline or nobody assigned" : "";
  const who: string[] = [];
  if (d.notifyOwner) who.push("me");
  if (d.notifyManagers) who.push("the manager(s)");
  if (d.notifyDirectors) who.push("the directors");
  if (d.warnPerson && d.scopeType === "person") who.push(d.personName || "the person");
  if (d.extraNames.length) who.push(d.extraNames.join(", "));
  const doBit = d.condition === "due_tomorrow"
    ? `send ${who.length ? who.join(" + ") : "…"} one list`
    : who.length ? `notify ${who.join(" + ")}` : "";
  const acts: string[] = [];
  if (d.autoAct) {
    if (d.postUpdate) acts.push("post an update on the task");
    if (d.setStatus) acts.push(`set the status to ${d.setStatus}`);
    if (d.sendChannel) acts.push(`also send by ${d.sendChannel}`);
  }
  const doTail = [doBit, ...acts].filter(Boolean).join(", and ");
  return `${when}, watching ${scope}${cond ? `, ${cond}` : ""} — ${doTail || "…pick who to tell or what to do"}${tail(d)}.`;
}

/* ── Small Studio controls (the sheet's own palette, so light and dark follow) ── */

const NUM = "st-field h-10 rounded-[10px] px-2 text-center text-[13px] tabular-nums outline-none";
const TEXT = "st-field h-10 w-full rounded-[10px] px-3 text-[13px] outline-none placeholder:text-[var(--sh-muted)]";
const NOTE = "text-xs leading-snug text-[var(--sh-muted)]";

const clampInt = (v: string, lo: number, hi: number, empty = lo) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || empty));

function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className={cn(NOTE, "mt-0.5")}>{hint}</div>}
      </div>
      <OriToggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      className={cn("flex h-7 items-center whitespace-nowrap rounded-lg border px-2.5 text-xs transition-colors",
        on ? "border-[var(--sh-on-bg)] bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "border-[var(--sh-chip-line)] bg-[var(--sh-bg)] hover:border-[var(--sh-muted)]")}>
      {children}
    </button>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-[var(--sh-line)] py-3.5 last:border-b-0">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--sh-muted)]">{title}</h3>
      {children}
    </section>
  );
}

/** Names added one at a time from a picker, each removable (× on the chip). */
function NamePicker({ names, options, placeholder, onChange }: { names: string[]; options: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  return (
    <div>
      <Combobox options={options.filter((n) => !names.includes(n))} placeholder={placeholder} clearOnCommit
        onCommit={(v) => { if (options.includes(v) && !names.includes(v)) onChange([...names, v]); }} />
      {names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button key={n} type="button" onClick={() => onChange(names.filter((x) => x !== n))} aria-label={`Remove ${n}`}
              className="flex h-7 items-center gap-1.5 rounded-lg bg-[var(--sh-hover)] px-2.5 text-xs hover:text-[var(--st-late-text)]">
              {n}<X size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One editable escalation-ladder rung: the overdue-day + who-hears chips. */
function Rung({ step, onChange, onRemove }: { step: LadderStep; onChange: (patch: Partial<LadderStep>) => void; onRemove?: () => void }) {
  const toggles: [keyof LadderStep, string][] = [
    ["warnPerson", "Assignee"], ["notifyManagers", "Manager"], ["notifyDirectors", "Directors"], ["notifyOwner", "Me"], ["autoEscalate", "Escalate"],
  ];
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_24px] items-center gap-x-2.5 gap-y-2 rounded-[10px] border border-[var(--sh-line)] bg-[var(--sh-card)] px-2.5 py-1.5">
      <label className="flex items-center gap-1.5 text-[13px]">
        Day
        <input type="number" min={1} max={365} value={step.overdueDays} aria-label="Days overdue"
          onChange={(e) => onChange({ overdueDays: clampInt(e.target.value, 1, 365) })}
          className="st-field h-7 w-12 rounded-md px-1 text-center text-[13px] tabular-nums outline-none" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {toggles.map(([k, l]) => (
          <Chip key={k} on={step[k] === true} onClick={() => onChange({ [k]: !(step[k] === true) } as Partial<LadderStep>)}>{l}</Chip>
        ))}
      </div>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label="Remove this rung" className="grid h-6 w-6 place-items-center rounded-md text-[var(--sh-muted)] hover:text-[var(--st-late-text)]"><X size={12} strokeWidth={2.2} /></button>
      ) : <span />}
    </div>
  );
}

export function OriBuilder({ initial, from, people, companies, onClose }: {
  initial: Draft;
  /** What it was started from ("Overdue ladder" …), for the page footer's hint. */
  from: string | null;
  people: NamedRow[];
  companies: NamedRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [busy, start] = useTransition();
  const card = useRef<HTMLDivElement>(null);
  useFitFrame(card, { minimum: 480 });

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const personByName = useMemo(() => new Map(people.map((p) => [p.name, p.id])), [people]);
  const companyByName = useMemo(() => new Map(companies.map((c) => [c.name, c.id])), [companies]);
  const personNames = useMemo(() => people.map((p) => p.name), [people]);
  const companyNames = useMemo(() => companies.map((c) => c.name), [companies]);

  const coherent = useMemo(() => {
    if (d.whenMode === "recurring") {
      if (!d.recurTitle.trim() || !companyByName.has(d.recurCompanyName)) return false;
      return d.recurCadence === "monthly" || d.recurWeekdays.length > 0;
    }
    if (d.scopeType === "person" && !personByName.has(d.personName)) return false;
    if (d.scopeType === "company" && !companyByName.has(d.companyName)) return false;
    if (d.scopeType === "task" && !d.taskCode.trim()) return false;
    if (d.whenMode === "ladder") {
      // Every rung must tell someone or auto-escalate; needs at least one.
      return d.ladderSteps.some((s) => s.notifyOwner || s.notifyManagers || s.notifyDirectors || s.warnPerson || s.autoEscalate);
    }
    // A repeating nudge MUST carry a stop condition.
    if (d.repeatOn && !d.stopUntilUpdate && !d.stopUntilDeadline && !d.stopMaxOn) return false;
    const hasAudience = d.notifyOwner || d.notifyManagers || d.notifyDirectors || (d.warnPerson && d.scopeType === "person" && !!d.personName) || d.extraNames.length > 0;
    const hasAction = d.autoAct && (d.postUpdate || !!d.setStatus || !!d.sendChannel);
    return hasAudience || hasAction;
  }, [d, personByName, companyByName]);

  function send(payload: BuilderPayload, done: string) {
    start(async () => {
      const res = await createAutomationAction(payload);
      if (!res.ok) { toast(res.error ?? "Could not save the automation.", { tone: "danger" }); return; }
      toast(done, { tone: "success" });
      onClose();
      router.refresh();
    });
  }

  function save() {
    if (!coherent || busy) return;
    if (d.whenMode === "recurring") {
      send({
        recurring: {
          cadence: d.recurCadence,
          weekdays: d.recurCadence === "weekly" ? d.recurWeekdays : undefined,
          dayOfMonth: d.recurCadence === "monthly" ? d.recurDayOfMonth : undefined,
          companyId: companyByName.get(d.recurCompanyName) ?? 0,
          title: d.recurTitle.trim(),
          priority: d.recurPriority,
          status: d.recurStatus,
          description: d.recurDescription.trim() || undefined,
          assigneePersonIds: d.recurAssigneeNames.map((n) => personByName.get(n)).filter((x): x is number => typeof x === "number"),
        },
      }, "Recurring task saved — it's live.");
      return;
    }
    const scope: BuilderPayload["scope"] =
      d.scopeType === "person" ? { type: "person", personId: personByName.get(d.personName) }
        : d.scopeType === "company" ? { type: "company", companyId: companyByName.get(d.companyName) }
        : d.scopeType === "task" ? { type: "task", taskCode: d.taskCode.trim() } : { type: "everyone" };
    send({
      when: { mode: d.whenMode === "ladder" ? "daily" : d.whenMode, hour: d.hour, minute: d.minute, days: d.days, hoursBefore: d.hoursBefore },
      once: d.whenMode !== "ladder" && d.once ? true : undefined,
      condition: d.condition,
      scope,
      audience: {
        notifyOwner: d.notifyOwner, notifyManagers: d.notifyManagers, notifyDirectors: d.notifyDirectors, warnPerson: d.warnPerson,
        extraPersonIds: d.extraNames.map((n) => personByName.get(n)).filter((x): x is number => typeof x === "number"),
      },
      actions: d.autoAct
        ? { autoAct: true, postUpdate: d.postUpdate, updateText: d.updateText, setStatus: d.setStatus || undefined, sendChannel: d.sendChannel || undefined }
        : { autoAct: false },
      weekdaysOnly: d.weekdaysOnly || undefined,
      pausedUntil: d.pausedUntil || undefined,
      agingDays: AGING_CONDS.has(d.condition) ? d.agingDays : undefined,
      repeat: d.repeatOn && d.whenMode !== "ladder"
        ? {
            everyMinutes: d.repeatUnit === "hours" ? d.repeatEvery * 60 : d.repeatEvery,
            untilUpdate: d.stopUntilUpdate || undefined,
            untilDeadline: d.stopUntilDeadline || undefined,
            maxCount: d.stopMaxOn ? d.stopMaxCount : undefined,
            window: d.activeHoursOn ? { fromHour: d.activeFromHour, toHour: d.activeToHour } : undefined,
          }
        : undefined,
      ladder: d.whenMode === "ladder"
        ? { byHour: d.hour, steps: d.ladderSteps.map((s) => ({ overdueDays: s.overdueDays, notifyOwner: s.notifyOwner, notifyManagers: s.notifyManagers, notifyDirectors: s.notifyDirectors, warnPerson: s.warnPerson, autoEscalate: s.autoEscalate })) }
        : undefined,
      preferKind: d.whenMode === "ladder" ? undefined : d.preferKind,
    }, "Automation saved — it's live.");
  }

  const recurring = d.whenMode === "recurring";
  const ladder = d.whenMode === "ladder";

  /* ── Column A: When · If · Who ───────────────────────────────────────── */
  const when = (
    <Sec title="When">
      <div className="flex flex-wrap gap-1.5">
        {([
          ["at_hour", "At a time of day"], ["days_before", "Days before a deadline"], ["hours_before", "Hours before a deadline"],
          ["on_overdue", "When overdue"], ["daily", "Every day"], ["ladder", "Overdue ladder"], ["recurring", "Recurring task"],
        ] as const).map(([v, l]) => (
          <Chip key={v} on={d.whenMode === v} onClick={() => set({ whenMode: v })}>{l}</Chip>
        ))}
      </div>
      {ladder && (
        <div className="flex items-center gap-2">
          <span className={NOTE}>Check daily at</span>
          <FluidSelect value={String(d.hour)} options={HOURS} onSelect={(v) => set({ hour: Number(v) })} />
        </div>
      )}
      {d.whenMode === "at_hour" && (
        <div className="flex flex-wrap items-center gap-2">
          <FluidSelect value={String(d.hour)} options={HOURS.map((h) => ({ value: h.value, label: pad(Number(h.value)) }))} onSelect={(v) => set({ hour: Number(v) })} />
          <span className="text-[13px] text-[var(--sh-muted)]">:</span>
          <input type="number" min={0} max={59} value={d.minute} aria-label="Minute (0–59)"
            onChange={(e) => set({ minute: clampInt(e.target.value, 0, 59, 0) })} className={cn(NUM, "w-16")} />
          <span className={NOTE}>fires within ~15 minutes of that time</span>
        </div>
      )}
      {d.whenMode === "days_before" && (
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={365} value={d.days} aria-label="Days before the deadline"
            onChange={(e) => set({ days: clampInt(e.target.value, 0, 365, 0) })} className={cn(NUM, "w-20")} />
          <span className={NOTE}>days before the deadline</span>
        </div>
      )}
      {d.whenMode === "hours_before" && (
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={720} value={d.hoursBefore} aria-label="Hours before the deadline"
            onChange={(e) => set({ hoursBefore: clampInt(e.target.value, 1, 720) })} className={cn(NUM, "w-20")} />
          <span className={NOTE}>hours before the deadline (re-arms if the deadline moves)</span>
        </div>
      )}
      {recurring && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={d.recurCadence === "weekly"} onClick={() => set({ recurCadence: "weekly" })}>Weekly</Chip>
            <Chip on={d.recurCadence === "monthly"} onClick={() => set({ recurCadence: "monthly" })}>Monthly</Chip>
          </div>
          {d.recurCadence === "weekly" ? (
            <div className="flex flex-wrap gap-1.5">
              {DAY_CHIPS.map(({ v, l }) => (
                <Chip key={v} on={d.recurWeekdays.includes(v)}
                  onClick={() => set({ recurWeekdays: d.recurWeekdays.includes(v) ? d.recurWeekdays.filter((x) => x !== v) : [...d.recurWeekdays, v] })}>
                  {l}
                </Chip>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={NOTE}>Day of month</span>
              <input type="number" min={1} max={31} value={d.recurDayOfMonth} aria-label="Day of month"
                onChange={(e) => set({ recurDayOfMonth: clampInt(e.target.value, 1, 31) })} className={cn(NUM, "w-16")} />
            </div>
          )}
          <p className={NOTE}>Each occurrence at 09:00 Dar es Salaam time.</p>
        </div>
      )}
    </Sec>
  );

  // IF — not for the ladder (its steps carry their own conditions) or a recurring
  // task (it is not a reminder about an existing task).
  const ifSec = !ladder && !recurring && (
    <Sec title="If">
      <div className="flex flex-wrap gap-1.5">
        {COND_OPTIONS.map((o) => <Chip key={o.value} on={d.condition === o.value} onClick={() => set({ condition: o.value })}>{o.label}</Chip>)}
      </div>
      {d.condition === "due_tomorrow" && <p className={NOTE}>Everything due tomorrow goes out as one combined list, not one message per task.</p>}
      {AGING_CONDS.has(d.condition) && (
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={90} value={d.agingDays} aria-label="Days"
            onChange={(e) => set({ agingDays: clampInt(e.target.value, 1, 90) })} className={cn(NUM, "w-20")} />
          <span className={NOTE}>days {d.condition === "under_review_stale" ? "sat Under Review" : "sat Waiting External"} before it fires</span>
        </div>
      )}
      {d.condition === "no_deadline_or_assignee" && <p className={NOTE}>Flags open tasks with no deadline set, or nobody assigned — the ones that slip through.</p>}
    </Sec>
  );

  const who = !recurring && (
    <Sec title="Who">
      <div className="flex flex-wrap gap-1.5">
        {([["everyone", "Everyone"], ["person", "A person"], ["company", "A company"], ["task", "One task"]] as const).map(([v, l]) => (
          <Chip key={v} on={d.scopeType === v} onClick={() => set({ scopeType: v })}>{l}</Chip>
        ))}
      </div>
      {d.scopeType === "person" && (
        <Combobox key="person" options={personNames} defaultValue={d.personName} placeholder="Pick a person…" onCommit={(v) => set({ personName: v })} onInput={(v) => set({ personName: v })} />
      )}
      {d.scopeType === "company" && (
        <Combobox key="company" options={companyNames} defaultValue={d.companyName} placeholder="Pick a company…" onCommit={(v) => set({ companyName: v })} onInput={(v) => set({ companyName: v })} />
      )}
      {d.scopeType === "task" && (
        <input value={d.taskCode} onChange={(e) => set({ taskCode: e.target.value })} placeholder="Task code, e.g. DS-003" aria-label="Task code" className={TEXT} />
      )}
      {!ladder && (
        <div className="mt-1 flex flex-col gap-2.5">
          <ToggleRow label="Notify me" on={d.notifyOwner} onChange={(v) => set({ notifyOwner: v })} />
          <ToggleRow label="Notify the manager(s)" hint="The line manager(s) of whoever the task belongs to" on={d.notifyManagers} onChange={(v) => set({ notifyManagers: v })} />
          <ToggleRow label="Notify directors" on={d.notifyDirectors} onChange={(v) => set({ notifyDirectors: v })} />
          {d.scopeType === "person" && (
            <ToggleRow label="Warn the person" hint="A direct nudge to the person the rule watches" on={d.warnPerson} onChange={(v) => set({ warnPerson: v })} />
          )}
          <NamePicker names={d.extraNames} options={personNames} placeholder="Also notify… (add people)" onChange={(extraNames) => set({ extraNames })} />
        </div>
      )}
    </Sec>
  );

  /* ── Column B: Task template · Steps · Schedule · Repeat · Do ─────────── */
  // What the created task looks like each time a recurring rule fires.
  const template = recurring && (
    <Sec title="Task template">
      <input value={d.recurTitle} onChange={(e) => set({ recurTitle: e.target.value })} placeholder="What needs to be done, e.g. Open the shop" aria-label="Task title" className={TEXT} />
      <Combobox options={companyNames} defaultValue={d.recurCompanyName} placeholder="Pick a company…" onCommit={(v) => set({ recurCompanyName: v })} onInput={(v) => set({ recurCompanyName: v })} />
      <div className="grid grid-cols-2 gap-2">
        <FluidSelect value={d.recurPriority} options={RECUR_PRIORITIES.map((p) => ({ value: p, label: `${p} priority` }))} onSelect={(v) => set({ recurPriority: v })} className="block" buttonClassName="w-full" />
        <FluidSelect value={d.recurStatus} options={RECUR_STATUSES.map((s) => ({ value: s, label: s }))} onSelect={(v) => set({ recurStatus: v })} className="block" buttonClassName="w-full" />
      </div>
      <NamePicker names={d.recurAssigneeNames} options={personNames} placeholder="Assign to… (add people)" onChange={(recurAssigneeNames) => set({ recurAssigneeNames })} />
      <textarea value={d.recurDescription} onChange={(e) => set({ recurDescription: e.target.value })} rows={2} aria-label="Description"
        placeholder="Description (optional) — becomes the task's comments" className="st-field w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none placeholder:text-[var(--sh-muted)]" />
    </Sec>
  );

  const steps = ladder && (
    <Sec title="Steps">
      <p className={NOTE}>Each rung fires once when a task first crosses that many days overdue, widening who hears it.</p>
      <div className="flex flex-col gap-1.5">
        {[...d.ladderSteps].sort((a, b) => a.overdueDays - b.overdueDays).map((s, i) => (
          <Rung key={i} step={s}
            onChange={(patch) => set({ ladderSteps: d.ladderSteps.map((x) => (x === s ? { ...x, ...patch } : x)) })}
            onRemove={d.ladderSteps.length > 1 ? () => set({ ladderSteps: d.ladderSteps.filter((x) => x !== s) }) : undefined} />
        ))}
      </div>
      {d.ladderSteps.length < 8 && (
        <button type="button"
          onClick={() => {
            const maxDay = Math.max(0, ...d.ladderSteps.map((s) => s.overdueDays));
            set({ ladderSteps: [...d.ladderSteps, { overdueDays: maxDay + 2, notifyOwner: false, notifyManagers: true, notifyDirectors: false, warnPerson: true, autoEscalate: false }] });
          }}
          className="flex w-fit items-center gap-1 text-xs text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
          <Plus size={12} />Add a rung (up to 8)
        </button>
      )}
    </Sec>
  );

  // SCHEDULE — every mode except recurring (its cadence is set above, and
  // weekdays-only/pause don't apply to a standing task-creation rule).
  const schedule = !recurring && (
    <Sec title="Schedule">
      <div className="flex flex-wrap gap-1.5">
        {!ladder && <Chip on={d.once} onClick={() => set({ once: !d.once })} title="Fires a single time, then the rule retires itself">Just once</Chip>}
        <Chip on={d.weekdaysOnly} onClick={() => set({ weekdaysOnly: !d.weekdaysOnly })} title="Skip Saturdays and Sundays">Weekdays only</Chip>
        <Chip on={d.pauseOpen || !!d.pausedUntil} onClick={() => (d.pauseOpen || d.pausedUntil ? set({ pauseOpen: false, pausedUntil: "" }) : set({ pauseOpen: true }))}
          title="Stay idle until a date">
          {d.pausedUntil ? `Paused until ${d.pausedUntil}` : "Pause until…"}
        </Chip>
      </div>
      {(d.once || d.weekdaysOnly) && (
        <p className={NOTE}>
          {[d.once && !ladder ? "Just once: fires a single time, then the rule retires itself." : "", d.weekdaysOnly ? "Weekdays only: skips Saturdays and Sundays." : ""].filter(Boolean).join(" ")}
        </p>
      )}
      {(d.pauseOpen || d.pausedUntil) && (
        <div className="flex items-center gap-2">
          <span className={NOTE}>Idle until</span>
          <span className="st-date block w-44">
            <DatePopover value={d.pausedUntil || null} label={d.pausedUntil ? null : "Pick a date"} onChange={(v) => set({ pausedUntil: v })} block
              triggerClassName="st-field flex h-10 w-full items-center rounded-[10px] px-3 text-left text-[13px]" />
          </span>
        </div>
      )}
    </Sec>
  );

  // REPEAT — a high-frequency nudge that stops on response (not for a ladder or a
  // recurring task — those aren't a reminder about an existing task).
  const repeat = !ladder && !recurring && (
    <Sec title="Repeat">
      <ToggleRow label="Keep reminding until they respond" on={d.repeatOn} onChange={(v) => set({ repeatOn: v })} />
      <p className={NOTE}>Every N hours · stop when they post, the deadline passes or after a set count · only within active hours</p>
      {d.repeatOn && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-[var(--sh-card)] p-3">
          <div className="flex items-center gap-2">
            <span className={NOTE}>Every</span>
            <input type="number" min={1} max={999} value={d.repeatEvery} aria-label="Repeat interval"
              onChange={(e) => set({ repeatEvery: clampInt(e.target.value, 1, 999) })} className={cn(NUM, "w-16")} />
            <FluidSelect value={d.repeatUnit} options={[{ value: "minutes", label: "minutes" }, { value: "hours", label: "hours" }]} onSelect={(v) => set({ repeatUnit: v as Draft["repeatUnit"] })} />
          </div>
          {d.repeatUnit === "minutes" && d.repeatEvery < 15 && (
            <p className="text-xs text-[var(--st-late-text)]">The shortest interval is 15 minutes — it will be raised to 15.</p>
          )}
          <div className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--sh-muted)]">Stop when…</div>
          <ToggleRow label="They post an update" hint="Recommended — the nudge ends the instant they respond" on={d.stopUntilUpdate} onChange={(v) => set({ stopUntilUpdate: v })} />
          <ToggleRow label="The deadline passes" on={d.stopUntilDeadline} onChange={(v) => set({ stopUntilDeadline: v })} />
          <ToggleRow label="A number of reminders is reached" on={d.stopMaxOn} onChange={(v) => set({ stopMaxOn: v })} />
          {d.stopMaxOn && (
            <div className="flex items-center gap-2">
              <span className={NOTE}>Stop after</span>
              <input type="number" min={1} max={100} value={d.stopMaxCount} aria-label="Stop after this many reminders"
                onChange={(e) => set({ stopMaxCount: clampInt(e.target.value, 1, 100) })} className={cn(NUM, "w-16")} />
              <span className={NOTE}>reminders</span>
            </div>
          )}
          {!d.stopUntilUpdate && !d.stopUntilDeadline && !d.stopMaxOn && (
            <p className="text-xs text-[var(--st-late-text)]">Pick at least one stop — a repeating reminder can&rsquo;t run for ever.</p>
          )}
          <ToggleRow label="Only within active hours" hint="Never ping overnight" on={d.activeHoursOn} onChange={(v) => set({ activeHoursOn: v })} />
          {d.activeHoursOn && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={NOTE}>From</span>
              <FluidSelect value={String(d.activeFromHour)} options={HOURS} onSelect={(v) => set({ activeFromHour: Number(v) })} />
              <span className={NOTE}>to</span>
              <FluidSelect value={String(d.activeToHour)} options={HOURS} onSelect={(v) => set({ activeToHour: Number(v) })} />
            </div>
          )}
        </div>
      )}
    </Sec>
  );

  // DO — not for the ladder (its steps carry their own actions) or a recurring
  // task (it always just creates the task).
  const doSec = !ladder && !recurring && (
    <Sec title="Do">
      <ToggleRow label="Let ORI act by itself" on={d.autoAct} onChange={(v) => set({ autoAct: v })} />
      <p className={NOTE}>Off: ORI only notifies — it never changes anything itself. On: it may post an update or set a status, and send by in-app, email or WhatsApp.</p>
      {d.autoAct && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-[var(--sh-card)] p-3">
          <ToggleRow label="Post an update on the task" on={d.postUpdate} onChange={(v) => set({ postUpdate: v })} />
          {d.postUpdate && (
            <input value={d.updateText} onChange={(e) => set({ updateText: e.target.value })} placeholder="Optional custom update text…" aria-label="Update text" className={TEXT} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(NOTE, "w-24")}>Set status to</span>
            <FluidSelect value={d.setStatus} options={[{ value: "", label: "Don't change" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} onSelect={(v) => set({ setStatus: v })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(NOTE, "w-24")}>Also send by</span>
            <FluidSelect value={d.sendChannel} options={[{ value: "", label: "In-app only" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }]} onSelect={(v) => set({ sendChannel: v as Draft["sendChannel"] })} />
          </div>
          {d.sendChannel && <p className={NOTE}>Only goes out if auto-send is switched on in Settings — otherwise it stays in-app.</p>}
        </div>
      )}
    </Sec>
  );

  return (
    <div ref={card} className="st-sheet st-pop flex flex-col overflow-hidden rounded-[22px]">
      <div className="st-tex-rings flex items-center gap-4 bg-[var(--st-card)] px-4 py-4 text-[var(--st-on-card)] sm:px-[22px] sm:py-[18px]">
        <button type="button" onClick={onClose} className="flex h-8 shrink-0 items-center gap-1.5 self-start rounded-[9px] bg-[var(--st-on-card)] px-3 text-xs font-medium text-[#111214] hover:opacity-90 sm:self-center">
          <ChevronLeft size={13} strokeWidth={2.2} /><span className="max-sm:hidden">ORI Automation</span><span className="sm:hidden">Back</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--st-on-card-muted)]">This rule will…{from && <span className="max-sm:hidden"> · from the “{from}” recipe</span>}</div>
          <div aria-live="polite" className="mt-[3px] text-[15px] leading-[1.35] sm:text-[18px]">{sentence(d)}</div>
        </div>
      </div>

      <div className="st-form grid min-h-0 flex-1 grid-cols-1 overflow-y-auto px-4 pb-2.5 pt-1.5 sm:px-[26px] lg:grid-cols-2 lg:gap-x-9">
        <div className="max-lg:border-b max-lg:border-[var(--sh-line)]">{when}{ifSec}{who}</div>
        <div>{template}{steps}{schedule}{repeat}{doSec}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--sh-line)] px-4 py-3.5 sm:px-[26px]">
        <span className="min-w-0 flex-1 text-xs text-[var(--sh-muted)]">{coherent ? "Ready — it goes live the moment you save." : "Save stays off until the rule makes sense."}</span>
        <button type="button" onClick={onClose} className="flex h-[38px] items-center rounded-[10px] border border-[var(--sh-chip-line)] px-4 text-[13px] hover:bg-[var(--sh-hover)]">Cancel</button>
        <button type="button" onClick={save} disabled={!coherent || busy}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-[var(--sh-on-bg)] px-[18px] text-[13px] font-semibold text-[var(--sh-on-fg)] transition-opacity hover:opacity-90 disabled:opacity-40">
          {busy && <Loader2 size={14} className="animate-spin" />}{busy ? "Saving…" : "Save automation"}
        </button>
      </div>
    </div>
  );
}
