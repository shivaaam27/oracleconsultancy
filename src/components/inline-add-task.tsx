"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Plus, Check, Search, ArrowRight } from "lucide-react";
import { createCaptureTask } from "@/app/capture/actions";
import { deleteTaskQuick } from "@/app/task/actions";
import { useToast } from "./toast";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { getInitials as initials } from "@/lib/names";
import type { QuickTaskCompany } from "./quick-task-popover";

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
  // Company is no longer picked here (the form collects it) — the default only
  // powers the Shift+Enter quick-save.
  const [companyId] = useState<number | undefined>(defaultCompanyId ?? companies[0]?.id);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [fly, setFly] = useState<string | null>(null);

  /** Enter → the full form, director-portal style: carries the typed title +
   *  any circles already picked, and guesses the company from the title words
   *  (e.g. "…for Terra Green" → Terra Green) when the picker wasn't touched. */
  function openForm() {
    const text = action.trim();
    const params = new URLSearchParams();
    if (text) params.set("title", text);
    const guessed = text
      ? companies.find((c) => {
          const n = c.name.toLowerCase().replace(/\s+(ltd|limited|llc|fzco)\.?$/i, "").trim();
          return n.length > 2 && text.toLowerCase().includes(n);
        })
      : undefined;
    const cid = guessed?.id ?? companyId;
    if (cid) params.set("companyId", String(cid));
    if (assignees.length) params.set("assignees", assignees.join(","));
    params.set("returnTo", `${location.pathname}${location.search}`);
    router.push(`${fullFormHref}?${params.toString()}`);
  }

  function submit() {
    const text = action.trim();
    if (!text) { inputRef.current?.focus(); return; }
    if (!companyId) { toast("Pick a company first.", { tone: "warn" }); return; }
    const names = assignees.slice();
    if (!reduce) setFly(text); // swipe-away the typed line
    setAction("");
    setAssignees([]);
    inputRef.current?.focus();
    start(async () => {
      const res = await createCaptureTask({
        companyId,
        actionItem: text,
        priority: "Medium",
        status: "Not Started",
        deadline: null,
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

  return (
    <div
      className={cn(
        "group/add relative flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 transition-colors",
        "border-border/70 bg-transparent focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15",
      )}
    >
      {/* Leading + — decoration, not a control. It goes on a phone: it was
          sitting seven pixels from the assignee circle, which is a REAL "+",
          and between them they left the box you actually type in 174px wide. */}
      <span className="hidden h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent sm:grid">
        <Plus size={15} />
      </span>

      {/* action input — bare (no grey well) with a blinking caret + hint while
          empty, so it's clear you can type here. Enter opens the form; the
          quick pickers are gone (the form collects company/date). */}
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          id="inline-add-action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); submit(); }
            else if (e.key === "Enter") { e.preventDefault(); openForm(); }
          }}
          placeholder=" "
          aria-label="New task — what needs doing?"
          className="bare-field peer w-full bg-transparent text-sm outline-none caret-accent placeholder-shown:caret-transparent"
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center peer-placeholder-shown:flex">
          <span className="caret-blink mr-1.5 inline-block h-[1.15em] w-px shrink-0 rounded-full bg-accent" />
          <span className="truncate text-sm text-fg-subtle">
            What needs doing?<span className="hidden sm:inline"> · Enter opens the form · Shift+Enter quick-saves</span>
          </span>
        </span>
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

      {/* Only the assignee circle stays — company + deadline are collected by
          the form that opens on Enter. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <CirclePicker label="Assignee" align="right" trigger={
          <span className="flex items-center" title={assignees.length ? assignees.join(", ") : "Add assignee"}>
            {assignees.length > 0 && (
              <span className="flex -space-x-1.5">
                {assignees.slice(0, 3).map((n, i) => (
                  <span key={i} className="grid h-7 w-7 place-items-center rounded-full bg-bg-subtle text-xs font-semibold text-fg-muted ring-2 ring-bg-elev">{initials(n)}</span>
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
      </div>

      {/* Add */}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={cn(
          "shrink-0 inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-base font-medium transition-all active:scale-95",
          action.trim() ? "bg-accent text-accent-fg shadow-sm" : "bg-bg-subtle text-fg-subtle",
        )}
      >
        Add
      </button>

      {/* Full form — same destination as Enter, carries the typed line along. */}
      <button
        type="button"
        onClick={openForm}
        className="hidden shrink-0 items-center gap-0.5 pl-0.5 pr-1 text-xs text-fg-subtle transition-colors hover:text-accent sm:inline-flex"
        title="Open the full task form (Enter)"
      >
        Full form <ArrowRight size={11} />
      </button>
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
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-subtle text-xs font-semibold text-fg-muted">{initials(name)}</span>
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
