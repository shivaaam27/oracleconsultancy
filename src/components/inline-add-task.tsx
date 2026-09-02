"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Plus, Check, Search, ArrowRight, Building2, CalendarDays, Flag, ClipboardList, X } from "lucide-react";
import { createCaptureTask } from "@/app/capture/actions";
import { deleteTaskQuick } from "@/app/task/actions";
import { useToast } from "./toast";
import { PasteTasks } from "./paste-tasks";
import { PRIORITIES } from "@/lib/constants";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { getInitials as initials, getGivenName } from "@/lib/names";
import type { QuickTaskCompany } from "./quick-task-popover";

/* ------------------------------------------------------------------ *
 * InlineAddTask — the quick-add row, built for TEN tasks in a row.
 *
 * Type the action, Enter, next. The details every task needs — company,
 * person, deadline, priority — are CHIPS on the row that STAY SET between
 * adds (and are remembered on this device), so you set the company once
 * and type the list. A line that names a company or a person overrides the
 * chip for that one task, the same reading the capture wizard does.
 *
 *   Enter        → save, keep the chips, keep focus for the next one
 *   Shift+Enter  → the full form, with the line and the chips carried across
 *   Paste a list → many lines at once, previewed before anything is created
 *
 * Every task goes through createCaptureTask → createTaskCore, the one door,
 * so a quick-added task notifies its assignee and audits like any other.
 * ------------------------------------------------------------------ */

const STORE_KEY = "cos.quickAdd.ctx.v1";

type Ctx = { companyId?: number; assignees: string[]; deadline: string; priority: string };

function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function plusDays(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return ymdLocal(d); }
function monthEnd(): string { const d = new Date(); return ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function shortCompany(name: string): string {
  return name.replace(/\s+(ltd|limited|llc|fzco|pvt\.?\s*ltd)\.?$/i, "").trim();
}

export function InlineAddTask({
  companies,
  people = [],
  defaultCompanyId,
  fullFormHref = "/task/new",
}: {
  companies: QuickTaskCompany[];
  people?: string[];
  /** The company the list is filtered to, if any — it pins the company chip. */
  defaultCompanyId?: number;
  fullFormHref?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [action, setAction] = useState("");
  const [ctx, setCtx] = useState<Ctx>({ companyId: defaultCompanyId, assignees: [], deadline: "", priority: "Medium" });
  const [fly, setFly] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  // Remembered on this device — a convenience, never the truth. A filter's
  // company always wins over what was stored.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Ctx>;
        setCtx((c) => ({
          companyId: defaultCompanyId ?? (companies.some((x) => x.id === saved.companyId) ? saved.companyId : undefined),
          assignees: Array.isArray(saved.assignees) ? saved.assignees.filter((n) => people.includes(n)) : c.assignees,
          deadline: typeof saved.deadline === "string" && saved.deadline >= ymdLocal(new Date()) ? saved.deadline : "",
          priority: PRIORITIES.includes(saved.priority ?? "") ? saved.priority! : "Medium",
        }));
      }
    } catch { /* no storage — fine */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (defaultCompanyId) setCtx((c) => ({ ...c, companyId: defaultCompanyId })); }, [defaultCompanyId]);
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(ctx)); } catch { /* ignore */ } }, [ctx]);

  function guessCompany(text: string): number | undefined {
    if (!text) return undefined;
    return companies.find((c) => {
      const n = shortCompany(c.name).toLowerCase();
      return n.length > 2 && text.toLowerCase().includes(n);
    })?.id;
  }

  /** Shift+Enter → the full form, with the line and every chip carried across. */
  function openForm() {
    const text = action.trim();
    const params = new URLSearchParams();
    if (text) params.set("title", text);
    const cid = guessCompany(text) ?? ctx.companyId;
    if (cid) params.set("companyId", String(cid));
    if (ctx.assignees.length) params.set("assignees", ctx.assignees.join(","));
    if (ctx.deadline) params.set("deadline", ctx.deadline);
    params.set("returnTo", `${location.pathname}${location.search}`);
    router.push(`${fullFormHref}?${params.toString()}`);
  }

  /** Enter → save on the spot. Needs a company: the chip, the filter, or one
   *  named in the line. Without one the form opens instead of guessing. */
  function submit() {
    const text = action.trim();
    if (!text) { inputRef.current?.focus(); return; }
    const cid = guessCompany(text) ?? ctx.companyId;
    if (!cid) {
      toast("Pick a company on the chip first, or name one in the line.", { tone: "warn", duration: 4000 });
      return;
    }
    const names = ctx.assignees.slice();
    const { deadline, priority } = ctx;
    if (!reduce) setFly(text);
    setAction("");
    inputRef.current?.focus();
    start(async () => {
      const res = await createCaptureTask({
        companyId: cid,
        actionItem: text,
        priority,
        status: "Not Started",
        deadline: deadline || null,
        assignees: names.join(", ") || undefined,
        createdBy: "web-ui",
      });
      if (!res.ok || !res.code) {
        setAction(text); // give the line back
        toast(res.error || "Couldn't add the task.", { tone: "danger" });
        return;
      }
      const code = res.code;
      setAdded((a) => [code, ...a].slice(0, 8));
      toast(`${code} added${names.length ? ` for ${getGivenName(names[0])}` : ""}.`, {
        tone: "success",
        duration: 6000,
        action: { label: "Undo", onClick: async () => { await deleteTaskQuick(code); setAdded((a) => a.filter((c) => c !== code)); router.refresh(); } },
      });
      router.refresh();
    });
  }

  const company = companies.find((c) => c.id === ctx.companyId);
  const companyPinned = !!defaultCompanyId;
  const quickDates = [
    { label: "Today", v: plusDays(0) }, { label: "Tomorrow", v: plusDays(1) },
    { label: "Next week", v: plusDays(7) }, { label: "Month end", v: monthEnd() },
  ];

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "group/add relative flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2 transition-colors sm:flex-nowrap",
          "border-border bg-bg-elev focus-within:border-accent/50",
        )}
      >
        <span className="hidden h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/10 text-accent sm:grid">
          <Plus size={14} />
        </span>

        <div className="relative min-w-[12rem] flex-1 basis-full sm:basis-auto">
          <input
            ref={inputRef}
            id="inline-add-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); openForm(); }
              else if (e.key === "Enter") { e.preventDefault(); submit(); }
            }}
            placeholder=" "
            aria-label="New task — what needs doing?"
            className="bare-field peer h-8 w-full bg-transparent text-sm outline-none caret-accent placeholder-shown:caret-transparent"
          />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center peer-placeholder-shown:flex">
            <span className="caret-blink mr-1.5 inline-block h-[1.15em] w-px shrink-0 bg-accent" />
            <span className="truncate text-sm text-fg-subtle">
              What needs doing?<span className="hidden md:inline"> · Enter adds it · Shift+Enter opens the form</span>
            </span>
          </span>
          <AnimatePresence>
            {fly && (
              <motion.span
                key={fly}
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                onAnimationComplete={() => setFly(null)}
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-fg"
              >
                {fly}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* The sticky chips. Each stays as set until you change it. */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <ChipPicker
            label="Company"
            set={!!company}
            pinned={companyPinned}
            icon={<Building2 size={12} />}
            text={company ? shortCompany(company.name) : "Company"}
            width={260}
          >
            {(close) => (
              <SearchList
                items={companies.map((c) => c.name)}
                selected={company ? [company.name] : []}
                onPick={(name) => { const c = companies.find((x) => x.name === name); if (c) setCtx((k) => ({ ...k, companyId: c.id })); close(); }}
                placeholder="Search companies…"
              />
            )}
          </ChipPicker>

          <ChipPicker
            label="Assignee"
            set={ctx.assignees.length > 0}
            icon={ctx.assignees.length ? undefined : <Plus size={12} />}
            text={ctx.assignees.length ? (
              <span className="inline-flex items-center gap-1">
                <span className="flex -space-x-1">
                  {ctx.assignees.slice(0, 3).map((n) => (
                    <span key={n} className="grid h-4 w-4 place-items-center rounded-full bg-accent/15 text-[9px] font-semibold text-accent ring-1 ring-bg-elev">{initials(n)}</span>
                  ))}
                </span>
                {ctx.assignees.length === 1 ? getGivenName(ctx.assignees[0]) : `${ctx.assignees.length} people`}
              </span>
            ) : "Who"}
            onClear={ctx.assignees.length ? () => setCtx((k) => ({ ...k, assignees: [] })) : undefined}
            width={260}
          >
            {() => (
              <SearchList
                items={people}
                selected={ctx.assignees}
                multi
                allowNew
                onPick={(n) => setCtx((k) => ({ ...k, assignees: k.assignees.includes(n) ? k.assignees.filter((x) => x !== n) : [...k.assignees, n] }))}
                placeholder="Search people…"
              />
            )}
          </ChipPicker>

          <ChipPicker
            label="Deadline"
            set={!!ctx.deadline}
            icon={<CalendarDays size={12} />}
            text={ctx.deadline ? shortDate(ctx.deadline) : "When"}
            onClear={ctx.deadline ? () => setCtx((k) => ({ ...k, deadline: "" })) : undefined}
            width={220}
          >
            {(close) => (
              <div className="space-y-1 p-1.5">
                {quickDates.map((q) => (
                  <button key={q.label} type="button" onClick={() => { setCtx((k) => ({ ...k, deadline: q.v })); close(); }}
                    className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-bg-muted", ctx.deadline === q.v ? "bg-accent/10 font-medium text-accent" : "text-fg")}>
                    {q.label}<span className="text-xs text-fg-subtle">{shortDate(q.v)}</span>
                  </button>
                ))}
                <input type="date" value={ctx.deadline} onChange={(e) => { setCtx((k) => ({ ...k, deadline: e.target.value })); if (e.target.value) close(); }}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-bg-elev px-2 text-sm" />
              </div>
            )}
          </ChipPicker>

          <ChipPicker
            label="Priority"
            set={ctx.priority !== "Medium"}
            icon={<Flag size={12} className={ctx.priority === "Critical" ? "text-danger" : ctx.priority === "High" ? "text-warn" : undefined} />}
            text={ctx.priority}
            width={160}
          >
            {(close) => (
              <div className="p-1.5">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" onClick={() => { setCtx((k) => ({ ...k, priority: p })); close(); }}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg-muted", ctx.priority === p ? "bg-accent/10 font-medium text-accent" : "text-fg")}>
                    <span className={cn("h-2 w-2 rounded-full", p === "Critical" ? "bg-danger" : p === "High" ? "bg-warn" : p === "Medium" ? "bg-info" : "bg-fg-subtle")} />
                    {p}
                  </button>
                ))}
              </div>
            )}
          </ChipPicker>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
            action.trim() ? "bg-accent text-accent-fg hover:opacity-90" : "bg-bg-subtle text-fg-subtle",
          )}
        >
          Add
        </button>

        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="hidden h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg sm:inline-flex"
          title="Paste several tasks, one per line"
        >
          <ClipboardList size={13} /> Paste a list
        </button>
        <button
          type="button"
          onClick={openForm}
          className="hidden h-8 shrink-0 items-center gap-0.5 px-1 text-xs text-fg-subtle transition-colors hover:text-accent sm:inline-flex"
          title="Open the full task form (Shift+Enter)"
        >
          Full form <ArrowRight size={11} />
        </button>
      </div>

      {/* What this sitting has added — so ten in a row is countable, and the
          last one is one click away if it needs its description. */}
      {added.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-fg-muted">
          <span>Added:</span>
          {added.map((c) => (
            <a key={c} href={`/task/${c}`} className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-muted ring-1 ring-border hover:text-accent">{c}</a>
          ))}
          <button type="button" onClick={() => setAdded([])} className="ml-1 text-fg-subtle hover:text-fg" aria-label="Clear the list"><X size={12} /></button>
        </div>
      )}

      <PasteTasks
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        companies={companies}
        people={people}
        defaults={ctx}
      />
    </div>
  );
}

/* A chip that opens a small anchored menu beneath it. Set chips read as
   filled; a pinned chip (the list's company filter) cannot be changed here. */
function ChipPicker({
  label, icon, text, set, pinned = false, onClear, width = 240, children,
}: {
  label: string;
  icon?: React.ReactNode;
  text: React.ReactNode;
  set: boolean;
  pinned?: boolean;
  onClear?: () => void;
  width?: number;
  children: (close: () => void) => React.ReactNode;
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
      let left = r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 6, left });
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, width]);

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={pinned}
        title={pinned ? `${label}: set by the list's filter` : label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-7 max-w-[11rem] items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          set ? "border-accent/30 bg-accent-soft text-accent" : "border-border bg-bg-elev text-fg-muted hover:text-fg",
          pinned && "cursor-default opacity-90",
          onClear && "rounded-r-none border-r-0",
        )}
      >
        {icon}
        <span className="truncate">{text}</span>
      </button>
      {onClear && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={onClear}
          className="grid h-7 w-6 place-items-center rounded-r-md border border-accent/30 bg-accent-soft text-accent/70 hover:text-accent"
        >
          <X size={11} />
        </button>
      )}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popRef}
              role="dialog"
              aria-label={label}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={spring}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[140] rounded-md border border-border bg-bg-elev shadow-lg"
            >
              {children(() => setOpen(false))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}

/* A searchable list — single pick (companies) or multi-tick (people). */
function SearchList({
  items, selected, onPick, placeholder, multi = false, allowNew = false,
}: {
  items: string[];
  selected: string[];
  onPick: (name: string) => void;
  placeholder: string;
  multi?: boolean;
  allowNew?: boolean;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = items.filter((p) => p.toLowerCase().includes(query));
  const canAddNew = allowNew && query.length > 1 && !items.some((p) => p.toLowerCase() === query);

  return (
    <div className="p-1.5">
      <div className="relative mb-1">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); onPick(matches[0]); if (!multi) return; setQ(""); } }}
          placeholder={placeholder}
          className="h-8 w-full rounded-md border border-border bg-bg-elev pl-8 pr-2.5 text-sm outline-none focus:border-accent/50"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {matches.map((name) => {
          const on = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick(name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                on ? "bg-accent/10 font-medium text-fg" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              {multi && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[10px] font-semibold text-fg-muted">{initials(name)}</span>}
              <span className="flex-1 truncate">{name}</span>
              {on && <Check size={14} className="text-accent" />}
            </button>
          );
        })}
        {canAddNew && (
          <button
            type="button"
            onClick={() => { onPick(q.trim()); setQ(""); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-accent hover:bg-accent/10"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/10"><Plus size={12} /></span>
            <span className="flex-1 truncate">Add “{q.trim()}”</span>
          </button>
        )}
        {matches.length === 0 && !canAddNew && (
          <p className="px-2 py-3 text-center text-xs text-fg-subtle">Nothing found.</p>
        )}
      </div>
    </div>
  );
}
