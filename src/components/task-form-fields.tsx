"use client";

import { useState } from "react";
import { CalendarDays, Repeat, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "@/components/fluid-select";
import { Switch } from "@/components/ui";
import { PRIORITIES } from "@/lib/constants";

/* Portal-grade field controls for the New-task form (Command Centre
 * unification, tasks refinement round 1): priority as a segment, deadline as
 * quick-pick chips + calendar, company as the kit FluidSelect. Each mirrors its
 * value into a plain form field so the server-action form stays unchanged. */

export function PrioritySegment({ defaultValue = "Medium" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60">
      <input type="hidden" name="priority" value={value} />
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setValue(p)}
          aria-pressed={value === p}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            value === p
              ? p === "Critical"
                ? "bg-danger text-white shadow-sm"
                : p === "High"
                  ? "bg-warn text-white shadow-sm"
                  : "bg-accent text-accent-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}
function monthEnd(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function DeadlineQuickPick({ name = "deadline", defaultValue = "" }: { name?: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [showPicker, setShowPicker] = useState(false);
  const quicks = [
    { label: "Today", v: ymd(0) },
    { label: "Tomorrow", v: ymd(1) },
    { label: "Next week", v: ymd(7) },
    { label: "Month end", v: monthEnd() },
  ];
  const quickActive = quicks.find((q) => q.v === value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={value} />
      {quicks.map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => { setValue(value === q.v ? "" : q.v); setShowPicker(false); }}
          aria-pressed={value === q.v}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
            value === q.v ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-elev text-fg-muted ring-border/60 hover:text-fg",
          )}
        >
          {q.label}
        </button>
      ))}
      {showPicker || (value && !quickActive) ? (
        <input
          type="date"
          value={value}
          autoFocus={showPicker}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-full bg-bg-elev px-3 py-1 text-xs ring-1 ring-accent/30 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-1 rounded-full bg-bg-elev px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border/60 transition-colors hover:text-fg"
        >
          <CalendarDays size={12} /> Pick…
        </button>
      )}
      {value && (
        <button type="button" onClick={() => { setValue(""); setShowPicker(false); }} className="text-[11px] text-fg-subtle hover:text-fg">
          Clear
        </button>
      )}
    </div>
  );
}

const REPEAT_DAY_CHIPS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

/** Collapsed "Repeat" section for the New Task form: toggle on → day-of-week
 *  chips (multi-select) or a Monthly day-of-month alternative. Mirrors its state
 *  into hidden fields (`repeatOn`/`repeatCadence`/`repeatWeekdays`/
 *  `repeatDayOfMonth`) so the plain server-action form (createTask) can read it
 *  with FormData — same pattern as PrioritySegment/CompanySelectField above.
 *  When on, createTask ALSO saves a standing recurring_task automation so future
 *  copies of this task auto-create on the chosen days/date (today's task is
 *  still created normally either way). */
export function RepeatSection() {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  return (
    <div className="rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
      <input type="hidden" name="repeatOn" value={on ? "1" : ""} />
      <input type="hidden" name="repeatCadence" value={cadence} />
      <input type="hidden" name="repeatWeekdays" value={weekdays.join(",")} />
      <input type="hidden" name="repeatDayOfMonth" value={String(dayOfMonth)} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <Repeat size={14} className="text-fg-muted" /> Repeat
        </span>
        <span className="flex items-center gap-2">
          {on && <span className="text-[11px] text-accent">On</span>}
          <ChevronDown size={14} className={cn("text-fg-subtle transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2.5">
          <button
            type="button"
            onClick={() => setOn((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-bg-elev px-3 py-2.5 ring-1 ring-border/60"
          >
            <span className="text-xs text-fg-muted">Recreate this task automatically</span>
            <Switch on={on} />
          </button>
          {on && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(["weekly", "monthly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCadence(c)}
                    aria-pressed={cadence === c}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors capitalize",
                      cadence === c ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {cadence === "weekly" ? (
                <div className="flex flex-wrap gap-1.5">
                  {REPEAT_DAY_CHIPS.map(({ v, l }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWeekdays((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))}
                      aria-pressed={weekdays.includes(v)}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors",
                        weekdays.includes(v) ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-fg-muted">Day of month</span>
                  <input
                    type="number" min={1} max={31} value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                    className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CompanySelectField({
  companies,
  defaultValue,
  name = "companyId",
}: {
  companies: Array<{ id: number; name: string }>;
  defaultValue?: number;
  name?: string;
}) {
  const [value, setValue] = useState(defaultValue != null ? String(defaultValue) : (companies[0] ? String(companies[0].id) : ""));
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <FluidSelect
        value={value}
        onSelect={setValue}
        options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
        className="w-full"
        buttonClassName="w-full justify-between"
      />
    </>
  );
}
