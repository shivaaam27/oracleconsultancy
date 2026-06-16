"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Plus, Check, CalendarDays, Building2, Search, ArrowRight } from "lucide-react";
import { createCaptureTask } from "@/app/capture/actions";
import { deleteTaskQuick } from "@/app/task/actions";
import { useToast } from "./toast";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { QuickTaskCompany } from "./quick-task-popover";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * InlineAddTask — one-step task create, right in the list (no popup).
 *
 * Type the action; pick Company · Assignee(s) · Deadline as small circles
 * (assignees render as the same avatar stack the rows use, so names never
 * clutter). Save (Enter or ✓) creates via createCaptureTask, plays a calm
 * "swipe away" motion, clears, and keeps focus for the next one. A quiet
 * "Full form →" stays for the rare task that needs everything.
 * ------------------------------------------------------------------ */
export function InlineAddTask({
  companies,
  people = [],
  defaultCompanyId,
  fullFormHref = "/task/new",
}: {
  companies: QuickTaskCompany[];
  people?: string[];
  defaultCompanyId?: number;
  fullFormHref?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [action, setAction] = useState("");
  const [companyId, setCompanyId] = useState<number | undefined>(defaultCompanyId ?? companies[0]?.id);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(""); // yyyy-mm-dd
  const [fly, setFly] = useState<string | null>(null);

  const company = companies.find((c) => c.id === companyId);

  function submit() {
    const text = action.trim();
    if (!text) { inputRef.current?.focus(); return; }
    if (!companyId) { toast("Pick a company first.", { tone: "warn" }); return; }
    const names = assignees.slice();
    const dl = deadline;
    if (!reduce) setFly(text); // swipe-away the typed line
    setAction("");
    setAssignees([]);
    setDeadline("");
    inputRef.current?.focus();
    start(async () => {
      const res = await createCaptureTask({
        companyId,
        actionItem: text,
        priority: "Medium",
        status: "Not Started",
        deadline: dl ? new Date(`${dl}T17:00:00`).toISOString() : null,
        assignees: names.join(", ") || undefined,
        createdBy: "web-ui",
      });
      if (!res.ok || !res.code) {
        toast(res.error || "Couldn't add the task.", { tone: "danger" });
        return;
      }
      const code = res.code;
      toast(`${code} added.`, {
        tone: "success",
        duration: 7000,
        action: { label: "Undo", onClick: async () => { await deleteTaskQuick(code); router.refresh(); } },
      });
      router.refresh();
    });
  }

  const dlLabel = deadline
    ? new Date(`${deadline}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <div
      className={cn(
        "group/add relative flex items-center gap-2 rounded-2xl border bg-bg-elev px-2.5 py-2 transition-colors",
        "border-border/70 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15",
      )}
    >
      {/* leading + */}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
        <Plus size={15} />
      </span>

      {/* action input (+ fly-away overlay) */}
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          id="inline-add-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="What needs doing?"
          aria-label="New task — what needs doing?"
          className="w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
        <AnimatePresence>
          {fly && (
            <motion.span
              key={fly}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -24, filter: "blur(1px)" }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              onAnimationComplete={() => setFly(null)}
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-fg"
            >
              {fly}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* circle pickers — company · assignee · deadline */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Company */}
        <CirclePicker label="Company" align="right" trigger={
          <span
            title={company ? company.name : "Pick a company"}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ring-1 transition-colors",
              company ? "bg-accent-soft text-accent ring-accent/25" : "bg-bg-subtle text-fg-subtle ring-border/60",
            )}
          >
            {company ? initials(company.name).slice(0, 2) : <Building2 size={13} />}
          </span>
        }>
          {(close) => (
            <div className="max-h-64 overflow-y-auto p-1">
              {companies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCompanyId(c.id); close(); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    c.id === companyId ? "bg-accent/12 text-fg font-medium" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
                  )}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-bg-subtle text-[9px] font-semibold text-fg-muted">{initials(c.name).slice(0, 2)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.id === companyId && <Check size={14} className="text-accent" />}
                </button>
              ))}
            </div>
          )}
        </CirclePicker>

        {/* Assignees — avatars + add */}
        <CirclePicker label="Assignee" align="right" trigger={
          <span className="flex items-center" title={assignees.length ? assignees.join(", ") : "Add assignee"}>
            {assignees.length > 0 && (
              <span className="flex -space-x-1.5">
                {assignees.slice(0, 3).map((n, i) => (
                  <span key={i} className="grid h-7 w-7 place-items-center rounded-full bg-bg-subtle text-[10px] font-semibold text-fg-muted ring-2 ring-bg-elev">{initials(n)}</span>
                ))}
              </span>
            )}
            <span className={cn(
              "grid h-7 w-7 place-items-center rounded-full ring-1 transition-colors",
              assignees.length ? "-ml-1.5 bg-bg-subtle text-fg-subtle ring-bg-elev" : "bg-bg-subtle text-fg-subtle ring-border/60",
            )}>
              <Plus size={13} />
            </span>
          </span>
        }>
          {() => <PeoplePicker people={people} selected={assignees} onToggle={(n) =>
            setAssignees((cur) => cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n])
          } />}
        </CirclePicker>

        {/* Deadline */}
        <CirclePicker label="Deadline" align="right" trigger={
          <span
            title={dlLabel ? `Due ${dlLabel}` : "Set a deadline"}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium ring-1 transition-colors",
              dlLabel ? "bg-accent-soft text-accent ring-accent/25" : "w-7 justify-center bg-bg-subtle text-fg-subtle ring-border/60",
            )}
          >
            <CalendarDays size={13} />
            {dlLabel && <span className="pr-0.5">{dlLabel}</span>}
          </span>
        }>
          {(close) => (
            <div className="w-52 p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { label: "Today", days: 0 },
                  { label: "Tomorrow", days: 1 },
                  { label: "+1 week", days: 7 },
                ]).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => { const d = new Date(); d.setDate(d.getDate() + o.days); setDeadline(d.toISOString().slice(0, 10)); close(); }}
                    className="rounded-lg bg-bg-subtle/70 px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={deadline}
                onChange={(e) => { setDeadline(e.target.value); if (e.target.value) close(); }}
                className="mt-2 w-full rounded-lg bg-bg-subtle/60 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              />
              {deadline && (
                <button type="button" onClick={() => { setDeadline(""); close(); }} className="mt-1.5 text-[11px] text-fg-muted hover:text-fg">Clear</button>
              )}
            </div>
          )}
        </CirclePicker>
      </div>

      {/* Add */}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={cn(
          "shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-all active:scale-95",
          action.trim() ? "bg-accent text-accent-fg shadow-sm" : "bg-bg-subtle text-fg-subtle",
        )}
      >
        Add
      </button>

      {/* Full form — for the rare task that needs everything */}
      <Link
        href={fullFormHref}
        onClick={(e) => e.stopPropagation()}
        className="hidden shrink-0 items-center gap-0.5 pl-0.5 pr-1 text-[11px] text-fg-subtle transition-colors hover:text-accent sm:inline-flex"
        title="Open the full task form"
      >
        Full form <ArrowRight size={11} />
      </Link>
    </div>
  );
}

/* A small circular trigger that opens an app-anchored glass popover under it. */
function CirclePicker({
  trigger,
  children,
  label,
  align = "left",
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  label: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 240;
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, align]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {trigger}
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popRef}
              role="dialog"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -2 }}
              transition={spring}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[140] w-60 glass glass-menu elevated rounded-xl shadow-lg"
            >
              {children(() => setOpen(false))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* Searchable, multi-select person list for the assignee picker. */
function PeoplePicker({
  people,
  selected,
  onToggle,
}: {
  people: string[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = people.filter((p) => p.toLowerCase().includes(query));
  const canAddNew = query.length > 1 && !people.some((p) => p.toLowerCase() === query);

  return (
    <div className="p-1.5">
      <div className="relative mb-1">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full rounded-lg bg-bg-subtle/60 py-1.5 pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {matches.map((name) => {
          const on = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onToggle(name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                on ? "bg-accent/12 text-fg font-medium" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-subtle text-[10px] font-semibold text-fg-muted">{initials(name)}</span>
              <span className="flex-1 truncate">{name}</span>
              {on && <Check size={14} className="text-accent" />}
            </button>
          );
        })}
        {canAddNew && (
          <button
            type="button"
            onClick={() => { onToggle(q.trim()); setQ(""); }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-accent hover:bg-accent/10"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10"><Plus size={13} /></span>
            <span className="flex-1 truncate">Add “{q.trim()}”</span>
          </button>
        )}
        {matches.length === 0 && !canAddNew && (
          <p className="px-2 py-3 text-center text-xs text-fg-subtle">No people found.</p>
        )}
      </div>
    </div>
  );
}
