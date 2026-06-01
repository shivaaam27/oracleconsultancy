"use client";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { spring } from "@/lib/motion";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the portalled menu just below the trigger, flipping/clamping to
  // stay on-screen. Runs on open and on scroll/resize so it tracks the anchor.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const btn = wrapRef.current?.querySelector("button");
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuW = menuRef.current?.offsetWidth ?? 200;
      const menuH = menuRef.current?.offsetHeight ?? 0;
      const margin = 8;
      let left = r.left;
      if (left + menuW > window.innerWidth - margin) left = window.innerWidth - menuW - margin;
      if (left < margin) left = margin;
      let top = r.bottom + 6;
      // Flip above if it would overflow the bottom edge.
      if (menuH && top + menuH > window.innerHeight - margin) top = Math.max(margin, r.top - menuH - 6);
      setPos({ top, left });
    };
    place();
    // Re-place once after the menu has measured its real size.
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -2 }}
              transition={spring}
              style={{ transformOrigin: "top left", top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[120] rounded-xl glass glass-menu shadow-lg p-1.5 min-w-[190px]"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {field === "deadline" ? (
                <div className="p-1">
                  <DeadlineInput initial={value} onSave={save} onCancel={() => setOpen(false)} />
                </div>
              ) : (
                <OptionList
                  options={options ?? defaultOptions(field)}
                  current={value}
                  onPick={save}
                  allowClear={field === "category"}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
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
      {options.map((opt) => {
        const active = opt === current;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onPick(opt)}
            className={cn(
              "w-full flex items-center gap-2 text-left text-sm px-2.5 py-2 rounded-lg transition-colors",
              active ? "bg-accent/12 text-fg font-medium" : "text-fg-muted hover:bg-bg-muted hover:text-fg"
            )}
          >
            <span className="flex-1 truncate">{opt}</span>
            {active && <Check size={14} className="text-accent shrink-0" />}
          </button>
        );
      })}
      {allowClear && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-left text-xs text-fg-muted px-2.5 py-1.5 rounded-lg hover:bg-bg-muted mt-1 border-t border-border"
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
