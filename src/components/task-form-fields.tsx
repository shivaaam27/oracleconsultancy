"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "@/components/fluid-select";
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
