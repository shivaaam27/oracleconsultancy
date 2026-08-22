"use client";

// Self-serve RULE BUILDER for ORI automations — the owner composes a standing
// rule as a plain WHEN / IF / WHO / DO recipe (no chat needed). A live sentence
// at the top always says exactly what will happen; auto-act is a clearly
// separated OPT-IN switch (default OFF, notify-only). All validation is
// re-done server-side in createAutomationAction — this form is just the hands.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Loader2, Wand2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { SwitchRow } from "@/components/ui";
import { useToast } from "@/components/toast";
import { STATUSES } from "@/lib/constants";
import { createAutomationAction, type BuilderPayload } from "./actions";

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

type Draft = {
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
  weekdaysOnly: false, pausedUntil: "",
  scopeType: "everyone", personName: "", companyName: "", taskCode: "",
  notifyOwner: true, notifyManagers: false, notifyDirectors: false, warnPerson: false, extraNames: [],
  ladderSteps: DEFAULT_LADDER,
  autoAct: false, postUpdate: false, updateText: "", setStatus: "", sendChannel: "",
  recurTitle: "", recurCompanyName: "", recurCadence: "weekly", recurWeekdays: [1],
  recurDayOfMonth: 1, recurPriority: "Medium", recurStatus: "Not Started",
  recurAssigneeNames: [], recurDescription: "",
};

const RECUR_PRIORITIES = ["Critical", "High", "Medium", "Low"];
// Open statuses only — a recurring task is never created straight into Completed/Closed.
const RECUR_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const DAY_CHIPS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

/** Which conditions read the aging-days threshold. */
const AGING_CONDS = new Set(["waiting_external_aged", "under_review_stale"]);

/* One-tap presets — each prefills the form; the owner tweaks + saves. */
const TEMPLATES: { label: string; hint: string; draft: Partial<Draft> }[] = [
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
  { label: "Compliance approaching", hint: "Morning compliance check → me", draft: { whenMode: "at_hour", hour: 9, condition: "compliance_due_soon", scopeType: "everyone", notifyOwner: true } },
  { label: "Nag until they reply", hint: "Overdue → every 6h until they update", draft: { whenMode: "on_overdue", condition: "always", scopeType: "task", notifyOwner: false, warnPerson: true, repeatOn: true, repeatEvery: 6, repeatUnit: "hours", stopUntilUpdate: true, activeHoursOn: true } },
  { label: "Deadline crunch", hint: "3h before due → hourly until done", draft: { whenMode: "hours_before", hoursBefore: 3, condition: "always", scopeType: "task", notifyOwner: false, warnPerson: true, repeatOn: true, repeatEvery: 1, repeatUnit: "hours", stopUntilUpdate: true, stopUntilDeadline: true } },
  { label: "Escalation watchdog", hint: "One task — escalate on 3d silence", draft: { whenMode: "days_before", days: 3, condition: "no_update_today", scopeType: "task", notifyOwner: true, preferKind: "escalate_if_no_update" } },
  { label: "Remind before deadline", hint: "One task — 2 days ahead", draft: { whenMode: "days_before", days: 2, condition: "always", scopeType: "task", notifyOwner: true, preferKind: "reminder_before_deadline" } },
];

const COND_OPTIONS = [
  { value: "always", label: "Always" },
  { value: "no_update_today", label: "No update posted today" },
  { value: "overdue", label: "Task is overdue" },
  { value: "due_tomorrow", label: "Due tomorrow (digest list)" },
  { value: "waiting_external_aged", label: "Waiting External too long" },
  { value: "under_review_stale", label: "Stuck Under Review" },
  { value: "no_deadline_or_assignee", label: "Missing deadline or assignee" },
  { value: "compliance_due_soon", label: "Compliance date approaching" },
];

const pad = (n: number) => String(n).padStart(2, "0");

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
  const open = d.whenMode === "at_hour" ? `from ${pad(d.hour)}:${pad(d.minute)}, `
    : d.whenMode === "hours_before" ? `from ${d.hoursBefore}h before the deadline, `
    : d.whenMode === "on_overdue" ? "once overdue, "
    : ""; // days_before / daily → no explicit opener
  return open;
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
    : d.condition === "no_deadline_or_assignee" ? "if it has no deadline or nobody assigned"
    : d.condition === "compliance_due_soon" ? "if a compliance date is approaching" : "";
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

export function RuleBuilder({ people, companies }: { people: NamedRow[]; companies: NamedRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(BLANK);
  const [busy, start] = useTransition();

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const openWith = (patch: Partial<Draft>) => { setD({ ...BLANK, notifyOwner: false, ...patch }); setOpen(true); };

  const personByName = useMemo(() => new Map(people.map((p) => [p.name, p.id])), [people]);
  const companyByName = useMemo(() => new Map(companies.map((c) => [c.name, c.id])), [companies]);

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

  function save() {
    if (d.whenMode === "recurring") {
      const payload: BuilderPayload = {
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
      };
      start(async () => {
        const res = await createAutomationAction(payload);
        if (!res.ok) { toast(res.error ?? "Could not save the automation.", { tone: "danger" }); return; }
        toast("Recurring task saved — it's live.", { tone: "success" });
        setOpen(false);
        router.refresh();
      });
      return;
    }
    const scope: BuilderPayload["scope"] =
      d.scopeType === "person" ? { type: "person", personId: personByName.get(d.personName) }
        : d.scopeType === "company" ? { type: "company", companyId: companyByName.get(d.companyName) }
        : d.scopeType === "task" ? { type: "task", taskCode: d.taskCode.trim() } : { type: "everyone" };
    const payload: BuilderPayload = {
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
    };
    start(async () => {
      const res = await createAutomationAction(payload);
      if (!res.ok) { toast(res.error ?? "Could not save the automation.", { tone: "danger" }); return; }
      toast("Automation saved — it's live.", { tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Header row: templates label + New automation button */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
          <Wand2 size={12} /> Quick recipes
        </span>
        <button
          type="button"
          onClick={() => { setD(BLANK); setOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-transform hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={13} /> New automation
        </button>
      </div>

      {/* Template gallery */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => openWith(t.draft)}
            className="rounded-xl bg-bg-subtle/50 px-3 py-2.5 text-left ring-1 ring-border/60 transition-colors hover:bg-bg-subtle hover:ring-border"
          >
            <span className="block text-xs font-medium text-fg">{t.label}</span>
            <span className="mt-0.5 block text-xs text-fg-muted">{t.hint}</span>
          </button>
        ))}
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="New automation"
        icon={<Sparkles size={16} />}
        maxWidth="max-w-xl"
        footer={
          <button
            type="button"
            disabled={!coherent || busy}
            onClick={save}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-transform hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {busy ? "Saving…" : "Save automation"}
          </button>
        }
      >
        <div className="space-y-5 pb-2">
          {/* Live sentence preview — always visible at the top */}
          <div
            className="rounded-xl px-3.5 py-3 text-base leading-snug text-fg ring-1 ring-accent/25"
            style={{ backgroundColor: "color-mix(in srgb, hsl(var(--accent)) 8%, transparent)" }}
          >
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-accent">This rule will</span>
            {sentence(d)}
          </div>

          {/* WHEN */}
          <Step label="When">
            <div className="flex flex-wrap gap-1.5">
              {([
                ["at_hour", "At a time of day"],
                ["days_before", "Days before a deadline"],
                ["hours_before", "Hours before a deadline"],
                ["on_overdue", "When overdue"],
                ["daily", "Every day"],
                ["ladder", "Overdue ladder"],
                ["recurring", "Recurring task"],
              ] as const).map(([v, l]) => (
                <Chip key={v} on={d.whenMode === v} onClick={() => set({ whenMode: v })}>{l}</Chip>
              ))}
            </div>
            {d.whenMode === "ladder" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-fg-muted">Check daily at</span>
                <FluidSelect
                  value={String(d.hour)}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${pad(h)}:00` }))}
                  onSelect={(v) => set({ hour: Number(v) })}
                />
              </div>
            )}
            {d.whenMode === "at_hour" && (
              <div className="mt-2 flex items-center gap-2">
                <FluidSelect
                  value={String(d.hour)}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: pad(h) }))}
                  onSelect={(v) => set({ hour: Number(v) })}
                />
                <span className="text-sm text-fg-muted">:</span>
                <input
                  type="number" min={0} max={59} value={d.minute}
                  onChange={(e) => set({ minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                  className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                  aria-label="Minute (0–59)"
                />
                <span className="text-xs text-fg-muted">fires within ~15 minutes of that time</span>
              </div>
            )}
            {d.whenMode === "days_before" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number" min={0} max={365} value={d.days}
                  onChange={(e) => set({ days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                  className="w-20 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                />
                <span className="text-xs text-fg-muted">days before the deadline</span>
              </div>
            )}
            {d.whenMode === "hours_before" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number" min={1} max={720} value={d.hoursBefore}
                  onChange={(e) => set({ hoursBefore: Math.max(1, Math.min(720, Number(e.target.value) || 1)) })}
                  className="w-20 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                />
                <span className="text-xs text-fg-muted">hours before the deadline (re-arms if the deadline moves)</span>
              </div>
            )}
            {d.whenMode === "recurring" && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={d.recurCadence === "weekly"} onClick={() => set({ recurCadence: "weekly" })}>Weekly</Chip>
                  <Chip on={d.recurCadence === "monthly"} onClick={() => set({ recurCadence: "monthly" })}>Monthly</Chip>
                </div>
                {d.recurCadence === "weekly" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_CHIPS.map(({ v, l }) => (
                      <Chip
                        key={v}
                        on={d.recurWeekdays.includes(v)}
                        onClick={() => set({ recurWeekdays: d.recurWeekdays.includes(v) ? d.recurWeekdays.filter((x) => x !== v) : [...d.recurWeekdays, v] })}
                      >
                        {l}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-fg-muted">Day of month</span>
                    <input
                      type="number" min={1} max={31} value={d.recurDayOfMonth}
                      onChange={(e) => set({ recurDayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                      className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                    />
                  </div>
                )}
                <p className="text-xs text-fg-muted">Each occurrence at 09:00 Dar es Salaam time.</p>
              </div>
            )}
          </Step>

          {/* TASK TEMPLATE — recurring task mode only. What the created task looks
              like each time it fires. */}
          {d.whenMode === "recurring" && (
            <Step label="Task template">
              <div className="space-y-2.5">
                <input
                  value={d.recurTitle}
                  onChange={(e) => set({ recurTitle: e.target.value })}
                  placeholder="What needs to be done, e.g. Open the shop"
                  className="w-full rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border placeholder:text-fg-subtle"
                />
                <Combobox options={companies.map((c) => c.name)} defaultValue={d.recurCompanyName} placeholder="Pick a company…" onCommit={(v) => set({ recurCompanyName: v })} onInput={(v) => set({ recurCompanyName: v })} />
                <div className="flex flex-wrap gap-2">
                  <FluidSelect value={d.recurPriority} options={RECUR_PRIORITIES.map((p) => ({ value: p, label: p }))} onSelect={(v) => set({ recurPriority: v })} />
                  <FluidSelect value={d.recurStatus} options={RECUR_STATUSES.map((s) => ({ value: s, label: s }))} onSelect={(v) => set({ recurStatus: v })} />
                </div>
                <div>
                  <Combobox
                    options={people.filter((p) => !d.recurAssigneeNames.includes(p.name)).map((p) => p.name)}
                    placeholder="Assign to… (add people)"
                    clearOnCommit
                    onCommit={(v) => { if (personByName.has(v) && !d.recurAssigneeNames.includes(v)) set({ recurAssigneeNames: [...d.recurAssigneeNames, v] }); }}
                  />
                  {d.recurAssigneeNames.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.recurAssigneeNames.map((n) => (
                        <button key={n} type="button" onClick={() => set({ recurAssigneeNames: d.recurAssigneeNames.filter((x) => x !== n) })}
                          className="rounded-lg bg-bg-subtle px-2 py-0.5 text-xs ring-1 ring-border hover:bg-danger/10 hover:text-danger">
                          {n} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  value={d.recurDescription}
                  onChange={(e) => set({ recurDescription: e.target.value })}
                  rows={2}
                  placeholder="Description (optional) — becomes the task's comments"
                  className="w-full rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border placeholder:text-fg-subtle"
                />
              </div>
            </Step>
          )}

          {/* IF — not shown for the ladder (it has its own step conditions), or for
              a recurring task (it's not a reminder about an existing task). */}
          {d.whenMode !== "ladder" && d.whenMode !== "recurring" && (
            <Step label="If">
              <FluidSelect value={d.condition} options={COND_OPTIONS} onSelect={(v) => set({ condition: v as Draft["condition"] })} />
              {d.condition === "due_tomorrow" && (
                <p className="mt-1.5 text-xs text-fg-muted">Everything due tomorrow goes out as one combined list, not one message per task.</p>
              )}
              {AGING_CONDS.has(d.condition) && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number" min={1} max={90} value={d.agingDays}
                    onChange={(e) => set({ agingDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
                    className="w-20 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                  />
                  <span className="text-xs text-fg-muted">
                    days {d.condition === "under_review_stale" ? "sat Under Review" : "sat Waiting External"} before it fires
                  </span>
                </div>
              )}
              {d.condition === "no_deadline_or_assignee" && (
                <p className="mt-1.5 text-xs text-fg-muted">Flags open tasks with no deadline set, or nobody assigned — the ones that slip through.</p>
              )}
            </Step>
          )}

          {/* WHO — not for a recurring task (it has its own company/assignees above). */}
          {d.whenMode !== "recurring" && (
          <Step label="Who">
            <div className="flex flex-wrap gap-1.5">
              {([["everyone", "Everyone"], ["person", "A person"], ["company", "A company"], ["task", "One task"]] as const).map(([v, l]) => (
                <Chip key={v} on={d.scopeType === v} onClick={() => set({ scopeType: v })}>{l}</Chip>
              ))}
            </div>
            {d.scopeType === "person" && (
              <div className="mt-2"><Combobox options={people.map((p) => p.name)} defaultValue={d.personName} placeholder="Pick a person…" onCommit={(v) => set({ personName: v })} onInput={(v) => set({ personName: v })} /></div>
            )}
            {d.scopeType === "company" && (
              <div className="mt-2"><Combobox options={companies.map((c) => c.name)} defaultValue={d.companyName} placeholder="Pick a company…" onCommit={(v) => set({ companyName: v })} onInput={(v) => set({ companyName: v })} /></div>
            )}
            {d.scopeType === "task" && (
              <input
                value={d.taskCode}
                onChange={(e) => set({ taskCode: e.target.value })}
                placeholder="Task code, e.g. DS-003"
                className="mt-2 w-full rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border placeholder:text-fg-subtle"
              />
            )}
            {d.whenMode !== "ladder" && (
            <div className="mt-3 space-y-2">
              <SwitchRow label="Notify me" on={d.notifyOwner} onChange={(v) => set({ notifyOwner: v })} />
              <SwitchRow label="Notify the manager(s)" hint="The line manager(s) of whoever the task belongs to" on={d.notifyManagers} onChange={(v) => set({ notifyManagers: v })} />
              <SwitchRow label="Notify directors" on={d.notifyDirectors} onChange={(v) => set({ notifyDirectors: v })} />
              {d.scopeType === "person" && (
                <SwitchRow label="Warn the person" hint="A direct nudge to the person the rule watches" on={d.warnPerson} onChange={(v) => set({ warnPerson: v })} />
              )}
              <div>
                <Combobox
                  options={people.filter((p) => !d.extraNames.includes(p.name)).map((p) => p.name)}
                  placeholder="Also notify… (add people)"
                  clearOnCommit
                  onCommit={(v) => { if (personByName.has(v) && !d.extraNames.includes(v)) set({ extraNames: [...d.extraNames, v] }); }}
                />
                {d.extraNames.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.extraNames.map((n) => (
                      <button key={n} type="button" onClick={() => set({ extraNames: d.extraNames.filter((x) => x !== n) })}
                        className="rounded-lg bg-bg-subtle px-2 py-0.5 text-xs ring-1 ring-border hover:bg-danger/10 hover:text-danger">
                        {n} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}
          </Step>
          )}

          {/* LADDER STEPS — only in ladder mode. */}
          {d.whenMode === "ladder" && (
            <Step label="Steps">
              <p className="mb-2 text-xs text-fg-muted">Each rung fires once when a task first crosses that many days overdue, widening who hears it.</p>
              <div className="space-y-2">
                {[...d.ladderSteps].sort((a, b) => a.overdueDays - b.overdueDays).map((s, i) => (
                  <LadderRow
                    key={i}
                    step={s}
                    onChange={(patch) => set({ ladderSteps: d.ladderSteps.map((x) => (x === s ? { ...x, ...patch } : x)) })}
                    onRemove={d.ladderSteps.length > 1 ? () => set({ ladderSteps: d.ladderSteps.filter((x) => x !== s) }) : undefined}
                  />
                ))}
              </div>
              {d.ladderSteps.length < 8 && (
                <button
                  type="button"
                  onClick={() => {
                    const maxDay = Math.max(0, ...d.ladderSteps.map((s) => s.overdueDays));
                    set({ ladderSteps: [...d.ladderSteps, { overdueDays: maxDay + 2, notifyOwner: false, notifyManagers: true, notifyDirectors: false, warnPerson: true, autoEscalate: false }] });
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle px-2.5 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border/60 hover:text-fg"
                >
                  <Plus size={12} /> Add a rung
                </button>
              )}
            </Step>
          )}

          {/* SCHEDULE — applies to every mode except recurring (its cadence is set above,
              and weekdays-only/pause don't apply to a standing task-creation rule). */}
          {d.whenMode !== "recurring" && (
          <Step label="Schedule">
            <div className="space-y-2">
              {d.whenMode !== "ladder" && (
                <SwitchRow label="Just once" hint="Fires a single time, then the rule retires itself" on={d.once} onChange={(v) => set({ once: v })} />
              )}
              <SwitchRow label="Weekdays only" hint="Skip Saturdays and Sundays" on={d.weekdaysOnly} onChange={(v) => set({ weekdaysOnly: v })} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-muted">Pause until</span>
                <input
                  type="date" value={d.pausedUntil}
                  onChange={(e) => set({ pausedUntil: e.target.value })}
                  className="rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                />
                {d.pausedUntil && (
                  <button type="button" onClick={() => set({ pausedUntil: "" })} className="text-xs text-fg-subtle hover:text-danger">clear</button>
                )}
              </div>
            </div>
          </Step>
          )}

          {/* REPEAT — high-frequency nudge that stops on response (not for ladder or a
              recurring task — those aren't a reminder about an existing task). */}
          {d.whenMode !== "ladder" && d.whenMode !== "recurring" && (
          <Step label="Repeat">
            <SwitchRow
              label="Keep reminding until they respond"
              hint="Ping on a set interval; stops the moment they post an update (or a stop below is hit)"
              on={d.repeatOn}
              onChange={(v) => set({ repeatOn: v })}
            />
            {d.repeatOn && (
              <div className="mt-2 space-y-2.5 rounded-xl bg-bg-subtle/40 p-2.5 ring-1 ring-border/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">Every</span>
                  <input
                    type="number" min={1} max={999} value={d.repeatEvery}
                    onChange={(e) => set({ repeatEvery: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
                    className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                    aria-label="Repeat interval"
                  />
                  <FluidSelect
                    value={d.repeatUnit}
                    options={[{ value: "minutes", label: "minutes" }, { value: "hours", label: "hours" }]}
                    onSelect={(v) => set({ repeatUnit: v as Draft["repeatUnit"] })}
                  />
                </div>
                {d.repeatUnit === "minutes" && d.repeatEvery < 15 && (
                  <p className="text-xs text-danger">Minimum interval is 15 minutes — it'll be raised to 15.</p>
                )}
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Stop when…</p>
                  <SwitchRow label="They post an update" hint="Recommended — the nudge ends the instant they respond" on={d.stopUntilUpdate} onChange={(v) => set({ stopUntilUpdate: v })} />
                  <SwitchRow label="The deadline passes" on={d.stopUntilDeadline} onChange={(v) => set({ stopUntilDeadline: v })} />
                  <SwitchRow label="A number of reminders is reached" on={d.stopMaxOn} onChange={(v) => set({ stopMaxOn: v })} />
                  {d.stopMaxOn && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-xs text-fg-muted">Stop after</span>
                      <input
                        type="number" min={1} max={100} value={d.stopMaxCount}
                        onChange={(e) => set({ stopMaxCount: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                        className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                      />
                      <span className="text-xs text-fg-muted">reminders</span>
                    </div>
                  )}
                  {!d.stopUntilUpdate && !d.stopUntilDeadline && !d.stopMaxOn && (
                    <p className="text-xs text-danger">Pick at least one stop — a repeating reminder can't run forever.</p>
                  )}
                </div>
                <SwitchRow label="Only within active hours" hint="Never ping overnight" on={d.activeHoursOn} onChange={(v) => set({ activeHoursOn: v })} />
                {d.activeHoursOn && (
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-xs text-fg-muted">From</span>
                    <FluidSelect value={String(d.activeFromHour)} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${pad(h)}:00` }))} onSelect={(v) => set({ activeFromHour: Number(v) })} />
                    <span className="text-xs text-fg-muted">to</span>
                    <FluidSelect value={String(d.activeToHour)} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${pad(h)}:00` }))} onSelect={(v) => set({ activeToHour: Number(v) })} />
                  </div>
                )}
              </div>
            )}
          </Step>
          )}

          {/* DO — not for the ladder (its steps carry their own actions) or a recurring
              task (it always just creates the task — no separate act step). */}
          {d.whenMode !== "ladder" && d.whenMode !== "recurring" && (
          <Step label="Do">
            <p className="mb-2 text-xs text-fg-muted">By default this rule only notifies — it never changes anything itself.</p>
            <SwitchRow
              label="Let ORI act automatically"
              hint="Off = notify-only. On = ORI may also do the things you tick below."
              on={d.autoAct}
              onChange={(v) => set({ autoAct: v })}
            />
            {d.autoAct && (
              <div className="mt-2 space-y-2 rounded-xl bg-bg-subtle/40 p-2.5 ring-1 ring-border/60">
                <SwitchRow label="Post an update on the task" on={d.postUpdate} onChange={(v) => set({ postUpdate: v })} />
                {d.postUpdate && (
                  <input
                    value={d.updateText}
                    onChange={(e) => set({ updateText: e.target.value })}
                    placeholder="Optional custom update text…"
                    className="w-full rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border placeholder:text-fg-subtle"
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">Set status to</span>
                  <FluidSelect
                    value={d.setStatus}
                    options={[{ value: "", label: "Don't change" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
                    onSelect={(v) => set({ setStatus: v })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">Also send by</span>
                  <FluidSelect
                    value={d.sendChannel}
                    options={[{ value: "", label: "In-app only" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }]}
                    onSelect={(v) => set({ sendChannel: v as Draft["sendChannel"] })}
                  />
                </div>
                {d.sendChannel && (
                  <p className="text-xs text-fg-muted">Only goes out if auto-send is switched on in Settings — otherwise it stays in-app.</p>
                )}
              </div>
            )}
          </Step>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">{label}</h3>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors ${on ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

/** One editable escalation-ladder rung: the overdue-day + who-hears toggles. */
function LadderRow({ step, onChange, onRemove }: {
  step: LadderStep;
  onChange: (patch: Partial<LadderStep>) => void;
  onRemove?: () => void;
}) {
  const toggles: [keyof LadderStep, string][] = [
    ["warnPerson", "Assignee"],
    ["notifyManagers", "Manager"],
    ["notifyDirectors", "Directors"],
    ["notifyOwner", "Me"],
    ["autoEscalate", "Escalate"],
  ];
  return (
    <div className="rounded-xl bg-bg-subtle/40 p-2.5 ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted">Day</span>
          <input
            type="number" min={1} max={365} value={step.overdueDays}
            onChange={(e) => onChange({ overdueDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
            className="w-16 rounded-lg bg-bg-elev px-2 py-1 text-sm ring-1 ring-border"
          />
          <span className="text-xs text-fg-muted">overdue</span>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-fg-subtle hover:text-danger">remove</button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {toggles.map(([k, l]) => (
          <Chip key={k} on={step[k] === true} onClick={() => onChange({ [k]: !(step[k] === true) } as Partial<LadderStep>)}>{l}</Chip>
        ))}
      </div>
    </div>
  );
}
