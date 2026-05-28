"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckSquare,
  Square,
  ChevronUp,
  X,
  Loader2,
  AlertOctagon,
  CalendarClock,
  Flag,
  CheckCheck,
  MessageSquarePlus,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { bulkUpdateTasks, type BulkAction } from "@/app/task/actions";
import { useToast } from "@/components/toast";

type SelectionCtx = {
  /** All codes currently rendered (used by selectAll). Reset by SelectionProvider on each render. */
  registerOrder: (codes: string[]) => void;
  selected: Set<string>;
  toggle: (code: string, opts?: { shift?: boolean }) => void;
  selectAll: () => void;
  clear: () => void;
};

const Ctx = createContext<SelectionCtx | null>(null);

export function useSelection() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const orderRef = useRef<string[]>([]);
  const lastClickedRef = useRef<string | null>(null);

  const registerOrder = useCallback((codes: string[]) => {
    orderRef.current = codes;
  }, []);

  const toggle = useCallback((code: string, opts?: { shift?: boolean }) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const order = orderRef.current;
      if (opts?.shift && lastClickedRef.current && order.length) {
        const a = order.indexOf(lastClickedRef.current);
        const b = order.indexOf(code);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const shouldSelect = !prev.has(code);
          for (let i = lo; i <= hi; i++) {
            if (shouldSelect) next.add(order[i]);
            else next.delete(order[i]);
          }
          lastClickedRef.current = code;
          return next;
        }
      }
      if (next.has(code)) next.delete(code);
      else next.add(code);
      lastClickedRef.current = code;
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(orderRef.current));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastClickedRef.current = null;
  }, []);

  const value = useMemo<SelectionCtx>(
    () => ({ registerOrder, selected, toggle, selectAll, clear }),
    [registerOrder, selected, toggle, selectAll, clear]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Registers the rendered task order with the selection context so shift-click ranges work.
 * Mount once per view (Board, Table) with the full visible code list.
 */
export function OrderRegistrar({ codes }: { codes: string[] }) {
  const { registerOrder } = useSelection();
  // Register on every render — cheap, ensures the order tracks filter changes.
  registerOrder(codes);
  return null;
}

export function SelectCheckbox({ code, className }: { code: string; className?: string }) {
  const { selected, toggle } = useSelection();
  const checked = selected.has(code);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(code, { shift: e.shiftKey });
      }}
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded transition-colors",
        checked ? "text-accent" : "text-fg-subtle hover:text-fg",
        className
      )}
      aria-label={checked ? `Deselect ${code}` : `Select ${code}`}
      aria-pressed={checked}
    >
      {checked ? <CheckSquare size={14} /> : <Square size={14} />}
    </button>
  );
}

const STATUSES = [
  "Not Started",
  "In Progress",
  "Under Review",
  "Waiting External",
  "Blocked",
  "Escalated",
  "Completed",
  "Closed",
];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

export function BulkBar() {
  const { selected, clear, selectAll } = useSelection();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "status" | "priority" | "postpone" | "update">(null);
  const [value, setValue] = useState("");
  const [days, setDays] = useState(7);
  const router = useRouter();
  const { toast } = useToast();

  const count = selected.size;
  if (count === 0) return null;

  const codes = Array.from(selected);

  const run = (action: BulkAction, label: string) => {
    start(async () => {
      const res = await bulkUpdateTasks(codes, action);
      if (res.errors.length > 0) {
        toast(`${label}: ${res.applied} applied, ${res.errors.length} failed`, { tone: "danger" });
      } else {
        toast(
          `${label}: ${res.applied} applied${res.skipped > 0 ? `, ${res.skipped} unchanged` : ""}`,
          { tone: "success" }
        );
      }
      setMode(null);
      setValue("");
      clear();
      router.refresh();
    });
  };

  const confirm = () => {
    if (!mode) return;
    if (mode === "status") {
      if (!value) return;
      run({ kind: "status", value }, `Set status to ${value}`);
    } else if (mode === "priority") {
      if (!value) return;
      run({ kind: "priority", value }, `Set priority to ${value}`);
    } else if (mode === "postpone") {
      if (!Number.isFinite(days) || days === 0) return;
      run({ kind: "postpone", days }, `Postpone ${days}d`);
    } else if (mode === "update") {
      const body = value.trim();
      if (!body) return;
      run({ kind: "update", body }, "Post update");
    }
  };

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center pointer-events-none px-3">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto vibrancy-strong rounded-2xl shadow-pill border border-border w-full max-w-[760px] overflow-hidden"
      >
        {/* Top row: count + actions */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={clear}
            className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
          <div className="text-sm font-medium tabular">
            {count} selected
          </div>
          <button
            onClick={selectAll}
            className="text-xs px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted inline-flex items-center gap-1"
          >
            <ListChecks size={12} /> Select all visible
          </button>
          <div className="flex-1" />
          {pending && <Loader2 size={14} className="animate-spin text-fg-muted" />}
          <BulkButton icon={ChevronUp} label="Status" onClick={() => { setMode(mode === "status" ? null : "status"); setValue(""); }} active={mode === "status"} />
          <BulkButton icon={Flag} label="Priority" onClick={() => { setMode(mode === "priority" ? null : "priority"); setValue(""); }} active={mode === "priority"} />
          <BulkButton icon={CalendarClock} label="Postpone" onClick={() => { setMode(mode === "postpone" ? null : "postpone"); }} active={mode === "postpone"} />
          <BulkButton icon={MessageSquarePlus} label="Update" onClick={() => { setMode(mode === "update" ? null : "update"); setValue(""); }} active={mode === "update"} />
          <BulkButton
            icon={AlertOctagon}
            label="Escalate"
            tone="danger"
            onClick={() => run({ kind: "escalate" }, "Escalated")}
          />
          <BulkButton
            icon={CheckCheck}
            label="Close"
            tone="success"
            onClick={() => run({ kind: "close" }, "Closed")}
          />
        </div>

        {/* Inline confirmation panel for actions needing a value */}
        {mode && (
          <div className="border-t border-border px-3 py-2 flex items-center gap-2 bg-bg-subtle">
            {mode === "status" && (
              <select
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm rounded-md bg-bg outline-none"
              >
                <option value="">Pick a status…</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
            {mode === "priority" && (
              <select
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm rounded-md bg-bg outline-none"
              >
                <option value="">Pick a priority…</option>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            )}
            {mode === "postpone" && (
              <>
                <input
                  autoFocus
                  type="number"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value, 10))}
                  className="w-20 px-2 py-1.5 text-sm rounded-md bg-bg outline-none"
                />
                <span className="text-xs text-fg-muted">
                  days {days >= 0 ? "later" : "earlier"} (applied to current deadline, or today if none)
                </span>
              </>
            )}
            {mode === "update" && (
              <input
                autoFocus
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
                placeholder="Update text to post on every selected task…"
                className="flex-1 px-2 py-1.5 text-sm rounded-md bg-bg outline-none"
              />
            )}
            <button
              onClick={confirm}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40"
            >
              Apply to {count}
            </button>
            <button
              onClick={() => { setMode(null); setValue(""); }}
              className="px-2 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function BulkButton({
  icon: Icon,
  label,
  onClick,
  active,
  tone,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger hover:bg-danger/10"
      : tone === "success"
        ? "text-success hover:bg-success/10"
        : "text-fg-muted hover:text-fg hover:bg-bg-muted";
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full transition-colors",
        active ? "bg-bg-muted text-fg" : toneClass
      )}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
