"use client";

import { useState } from "react";
import { CalendarDays, Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "@/components/fluid-select";
import { Switch, CONTROL_BOX } from "@/components/ui";
import { PRIORITIES } from "@/lib/constants";

/* Field controls for the New-task form. Each mirrors its value into a plain
 * hidden form field so the server-action form (createTask) reads it with
 * FormData — the same trick SelectField and FormSwitch use.
 *
 * Desk, not Aurora: every chip is a small square-cornered button in the ONE
 * control box height, never a pill; no glows, no blur. */

const CHIP = "h-8 rounded-md px-3 text-xs font-medium border transition-colors";
const CHIP_OFF = "border-border bg-bg-elev text-fg-muted hover:text-fg hover:bg-bg-subtle";
const CHIP_ON = "border-accent/40 bg-accent-soft text-accent";

export function PrioritySegment({ defaultValue = "Medium" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="priority" value={value} />
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setValue(p)}
          aria-pressed={value === p}
          className={cn(
            CHIP,
            value === p
              ? p === "Critical"
                ? "border-danger/40 bg-danger/10 text-danger"
                : p === "High"
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : CHIP_ON
              : CHIP_OFF,
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/* ⚠️ LOCAL DATES, NEVER `toISOString().slice(0, 10)`. That is the UTC day: in
   Dar (UTC+3) "Today" pressed before 3am gave yesterday, and "Month end" —
   built from LOCAL midnight on the last day — was ALWAYS one day short, because
   local midnight on the 31st is 21:00 UTC on the 30th. */
function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return ymdLocal(d);
}
function monthEnd(): string {
  const d = new Date();
  return ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
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
          className={cn(CHIP, value === q.v ? CHIP_ON : CHIP_OFF)}
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
          className={cn(CONTROL_BOX, "px-2.5 border border-accent/40 bg-bg-elev outline-none")}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className={cn(CHIP, CHIP_OFF, "inline-flex items-center gap-1.5")}
        >
          <CalendarDays size={13} /> Pick a date
        </button>
      )}
      {value && (
        <button type="button" onClick={() => { setValue(""); setShowPicker(false); }} className="h-8 px-2 text-xs text-fg-subtle hover:text-fg">
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

/** The "Repeat" row of the New Task form: one switch, and when it is on, the
 *  weekday chips or a day-of-month. Mirrors its state into hidden fields
 *  (`repeatOn`/`repeatCadence`/`repeatWeekdays`/`repeatDayOfMonth`) so
 *  createTask reads it with FormData. When on, createTask ALSO saves a standing
 *  recurring_task automation so future copies auto-create on those days —
 *  today's task is created normally either way.
 *
 *  It used to be a collapsed box inside a box: a chevron to open, THEN a switch
 *  to turn on. One switch now; the options appear beneath it. */
export function RepeatSection() {
  const [on, setOn] = useState(false);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  return (
    <div className="space-y-2.5">
      <input type="hidden" name="repeatOn" value={on ? "1" : ""} />
      <input type="hidden" name="repeatCadence" value={cadence} />
      <input type="hidden" name="repeatWeekdays" value={weekdays.join(",")} />
      <input type="hidden" name="repeatDayOfMonth" value={String(dayOfMonth)} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className="flex w-full items-center gap-3 rounded-md border border-border bg-bg-elev px-3 py-2 text-left hover:bg-bg-subtle transition-colors"
      >
        <Repeat size={14} className="shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">Repeat this task</span>
          <span className="block text-xs text-fg-muted">
            {on
              ? cadence === "weekly"
                ? `Every ${REPEAT_DAY_CHIPS.filter((c) => weekdays.includes(c.v)).map((c) => c.l).join(", ") || "— pick a day"}`
                : `On day ${dayOfMonth} of every month`
              : "Recreate it automatically on chosen days"}
          </span>
        </span>
        <Switch on={on} />
      </button>
      {on && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          {(["weekly", "monthly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              aria-pressed={cadence === c}
              className={cn(CHIP, "capitalize", cadence === c ? CHIP_ON : CHIP_OFF)}
            >
              {c}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {cadence === "weekly" ? (
            REPEAT_DAY_CHIPS.map(({ v, l }) => (
              <button
                key={v}
                type="button"
                onClick={() => setWeekdays((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))}
                aria-pressed={weekdays.includes(v)}
                className={cn(CHIP, "px-2.5", weekdays.includes(v) ? CHIP_ON : CHIP_OFF)}
              >
                {l}
              </button>
            ))
          ) : (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Day of month
              <input
                type="number" min={1} max={31} value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                className={cn(CONTROL_BOX, "w-16 px-2.5 border border-border bg-bg-elev")}
              />
            </label>
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
