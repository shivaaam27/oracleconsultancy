"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { inlineUpdateTask } from "@/app/task/actions";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { cn } from "@/lib/cn";

type Field = "status" | "priority" | "deadline" | "category" | "escalation";

type Props = {
  field: Field;
  taskCode: string;
  value: string | null;
  options?: string[];
  className?: string;
  children?: React.ReactNode;
};

export function InlineEdit({ field, taskCode, value, options, className, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = (next: string | null) => {
    startTransition(async () => {
      const res = await inlineUpdateTask(taskCode, field, next);
      setOpen(false);
      if (!res.ok) {
        toast(res.error || "Save failed.", { tone: "danger" });
        return;
      }
      if (res.undoToken) {
        toast(`${labelOf(field)} updated.`, {
          tone: "success",
          duration: 10000,
          action: {
            label: "Undo",
            onClick: async () => {
              const r = await callUndo(res.undoToken!);
              toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
            },
          },
        });
      }
    });
  };

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1 text-left hover:bg-bg-muted rounded px-1 -mx-1 transition-colors",
          pending && "opacity-50",
          className
        )}
      >
        {children}
        <ChevronDown size={10} className="opacity-50" />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 left-0 rounded-lg vibrancy-strong shadow-lg p-2 min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          {field === "deadline" ? (
            <DeadlineInput initial={value} onSave={save} onCancel={() => setOpen(false)} />
          ) : (
            <OptionList
              options={options ?? defaultOptions(field)}
              current={value}
              onPick={save}
              allowClear={field === "category"}
            />
          )}
        </div>
      )}
    </span>
  );
}

function labelOf(f: Field): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function defaultOptions(f: Field): string[] {
  if (f === "status") {
    return ["Not Started", "In Progress", "Under Review", "Waiting External", "Blocked", "Escalated", "Completed", "Closed"];
  }
  if (f === "priority") return ["Critical", "High", "Medium", "Low"];
  if (f === "escalation") return ["Yes", "No"];
  if (f === "category") return ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];
  return [];
}

function OptionList({
  options,
  current,
  onPick,
  allowClear,
}: {
  options: string[];
  current: string | null;
  onPick: (v: string | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onPick(opt)}
          className={cn(
            "text-left text-sm px-2 py-1.5 rounded hover:bg-bg-muted",
            opt === current && "bg-bg-muted font-semibold"
          )}
        >
          {opt}
        </button>
      ))}
      {allowClear && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-left text-xs text-fg-muted px-2 py-1.5 rounded hover:bg-bg-muted mt-1 border-t border-border"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function DeadlineInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string | null;
  onSave: (v: string | null) => void;
  onCancel: () => void;
}) {
  const d0 = initial ? new Date(initial) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const initTimed = !!d0 && (d0.getUTCHours() !== 0 || d0.getUTCMinutes() !== 0);
  const [date, setDate] = useState(d0 ? localDate(d0) : "");
  const [time, setTime] = useState(initTimed && d0 ? `${pad(d0.getHours())}:${pad(d0.getMinutes())}` : "");

  // Combine into a local datetime string (time optional → all-day).
  const compose = () => (date ? (time ? `${date}T${time}` : date) : null);

  return (
    <div className="flex flex-col gap-2 min-w-[210px]">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="px-2 py-1.5 text-sm rounded border border-border bg-bg"
      />
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date}
          className="flex-1 px-2 py-1.5 text-sm rounded border border-border bg-bg disabled:opacity-40"
        />
        {time && (
          <button type="button" onClick={() => setTime("")} className="text-xs text-fg-muted hover:text-fg px-1.5 py-1" title="All day">
            All day
          </button>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => onSave(null)}
          className="text-xs text-fg-muted hover:text-fg px-2 py-1"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded hover:bg-bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(compose())}
          className="text-xs px-2 py-1 rounded bg-accent text-accent-fg hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}
