"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Building2, Check, ChevronDown, Ellipsis, ListChecks, Search, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { CompanyAvatar } from "@/components/company-avatar";
import { getInitials } from "@/lib/names";
import { adminRemindTask } from "@/app/task/actions";
import { spring } from "@/lib/motion";

/* The Tasks page's ONE filter row (refinement round 1) — portal grammar:
 * counting chips (a chip = a filter), then Company ▾ / Person ▾ pickers, a
 * "⋯ More" popover for the rare filters, and Group ▾. Below it, an identity
 * strip appears when a company or person is picked — the person strip carries
 * the Assigned | Created-by toggle and Remind-all. All state lives in the URL
 * (server renders the hrefs); this component only owns the popovers. */

export type FilterChip = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone?: "danger" | "warn" | "info" | "default";
};

export type FilterOption = { key: string; label: string; count?: number; href: string; active: boolean };

export type IdentityStrip = {
  kind: "company" | "person";
  title: string;
  sub: string;
  logoUrl?: string | null;
  accent?: string | null;
  clearHref: string;
  /** Person strip only — the Assigned | Created by toggle. */
  segments?: Array<{ label: string; href: string; active: boolean }>;
  /** Person strip only — task id used to draft the consolidated reminder. */
  remindTaskId?: number | null;
  lateCount?: number;
};

/* Small anchored glass popover (same pattern as the inline-add circle pickers). */
function Popover({
  trigger,
  label,
  children,
  width = 260,
}: {
  trigger: (open: boolean) => React.ReactNode;
  label: string;
  children: (close: () => void) => React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      let left = r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, width]);

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
        {trigger(open)}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
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
                style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, visibility: pos ? "visible" : "hidden" }}
                className="fixed z-[140] glass glass-menu elevated rounded-xl shadow-lg"
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

function OptionList({
  options,
  close,
  searchable,
  emptyLabel = "Nothing here.",
}: {
  options: FilterOption[];
  close: () => void;
  searchable?: boolean;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  return (
    <div className="p-1.5">
      {searchable && (
        <div className="relative mb-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg bg-bg-subtle/60 py-1.5 pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {matches.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              close();
              router.push(o.href, { scroll: false });
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              o.active ? "bg-accent/12 font-medium text-fg" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className="shrink-0 text-[11px] tabular text-fg-subtle">{o.count}</span>}
            {o.active && <Check size={14} className="shrink-0 text-accent" />}
          </button>
        ))}
        {matches.length === 0 && <p className="px-2 py-3 text-center text-xs text-fg-subtle">{emptyLabel}</p>}
      </div>
    </div>
  );
}

const CHIP_TONE: Record<NonNullable<FilterChip["tone"]>, { off: string; on: string }> = {
  danger: {
    off: "bg-danger-soft/50 text-danger ring-danger/25 hover:ring-danger/45",
    on: "bg-danger text-white ring-danger font-semibold",
  },
  warn: {
    off: "bg-warn-soft/50 text-warn ring-warn/25 hover:ring-warn/45",
    on: "bg-warn text-white ring-warn font-semibold",
  },
  info: {
    off: "bg-info-soft/50 text-info ring-info/25 hover:ring-2",
    on: "bg-info text-white ring-info font-semibold",
  },
  default: {
    off: "bg-bg-elev text-fg-muted ring-border/60 hover:text-fg hover:ring-2",
    on: "bg-accent text-accent-fg ring-accent font-semibold",
  },
};

export function TaskFilterBar({
  q,
  searchHrefBase,
  chips,
  companyLabel,
  companyOptions,
  personLabel,
  personOptions,
  statusLabel,
  statusOptions,
  moreItems,
  moreActiveCount,
  groupLabel,
  groupOptions,
  strip,
}: {
  q: string;
  /** Href with every param EXCEPT q — the search box appends q client-side. */
  searchHrefBase: string;
  chips: FilterChip[];
  companyLabel: string | null;
  companyOptions: FilterOption[];
  personLabel: string | null;
  personOptions: FilterOption[];
  /** Full 8-status set (CLAUDE.md) — covers Under Review / Waiting External /
   *  Blocked / Escalated / Completed / Closed, none of which have their own
   *  quick chip. */
  statusLabel: string | null;
  statusOptions: FilterOption[];
  moreItems: FilterChip[];
  moreActiveCount: number;
  groupLabel: string;
  groupOptions: FilterOption[];
  strip: IdentityStrip | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [text, setText] = useState(q);
  const [reminding, setReminding] = useState(false);
  useEffect(() => setText(q), [q]);

  function submitSearch() {
    const u = new URL(searchHrefBase, window.location.origin);
    if (text.trim()) u.searchParams.set("q", text.trim());
    else u.searchParams.delete("q");
    router.push(`${u.pathname}?${u.searchParams.toString()}`, { scroll: false });
  }

  function remindAll() {
    if (!strip?.remindTaskId) return;
    setReminding(true);
    start(async () => {
      const res = await adminRemindTask(strip.remindTaskId!, true);
      setReminding(false);
      if (!res.ok) return toast(res.error, { tone: "warn" });
      if (res.link) window.open(res.link, "_blank");
      toast(`Full task list ready for ${res.name}.`, { tone: "success" });
    });
  }

  const ddChip = (open: boolean, icon: React.ReactNode, label: string, active: boolean) => (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ring-1 transition-all",
        active || open
          ? "bg-accent-soft font-semibold text-accent ring-accent/30"
          : "bg-bg-elev font-medium text-fg-muted ring-border/60 hover:text-fg hover:ring-2",
      )}
    >
      {icon}
      <span className="max-w-[9rem] truncate">{label}</span>
      <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
    </span>
  );

  return (
    <div className="space-y-2.5">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitSearch();
          }}
          placeholder="Search tasks, people, companies…"
          aria-label="Search tasks"
          className="w-full rounded-full border border-border/70 bg-bg-elev py-2.5 pl-10 pr-20 text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-accent/50 focus:ring-2 focus:ring-accent/15"
        />
        {(text || q) && (
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {q && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  router.push(searchHrefBase, { scroll: false });
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-subtle text-fg-subtle hover:text-fg"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
            {text.trim() !== q && (
              <button type="button" onClick={submitSearch} className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg">
                Search
              </button>
            )}
          </span>
        )}
      </div>

      {/* One filter row */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {chips.map((c) => {
          const tone = CHIP_TONE[c.tone ?? "default"];
          return (
            <Link
              key={c.key}
              href={c.href}
              scroll={false}
              aria-pressed={c.active}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-all",
                c.active ? tone.on : tone.off,
              )}
            >
              {c.label} <b className="font-bold tabular">{c.count}</b>
              {c.active && <X size={11} className="opacity-80" />}
            </Link>
          );
        })}

        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />

        <Popover label="Filter by company" trigger={(o) => ddChip(o, <Building2 size={13} />, companyLabel ?? "Company", !!companyLabel)}>
          {(close) => <OptionList options={companyOptions} close={close} searchable emptyLabel="No companies." />}
        </Popover>
        <Popover label="Filter by person" trigger={(o) => ddChip(o, <User size={13} />, personLabel ?? "Person", !!personLabel)}>
          {(close) => <OptionList options={personOptions} close={close} searchable emptyLabel="No people." />}
        </Popover>
        <Popover label="Filter by status" trigger={(o) => ddChip(o, <ListChecks size={13} />, statusLabel ?? "Status", !!statusLabel)}>
          {(close) => <OptionList options={statusOptions} close={close} />}
        </Popover>
        <Popover
          label="More filters"
          width={240}
          trigger={(o) => ddChip(o, <Ellipsis size={13} />, moreActiveCount > 0 ? `More · ${moreActiveCount}` : "More", moreActiveCount > 0)}
        >
          {(close) => (
            <OptionList
              options={moreItems.map((m) => ({ key: m.key, label: m.label, count: m.count, href: m.href, active: m.active }))}
              close={close}
            />
          )}
        </Popover>

        <span className="shrink-0 sm:ml-auto">
          <Popover label="Group by" width={180} trigger={(o) => ddChip(o, null, `Group: ${groupLabel}`, false)}>
            {(close) => <OptionList options={groupOptions} close={close} />}
          </Popover>
        </span>
      </div>

      {/* Identity strip — appears when a company/person is picked. */}
      {strip && (
        <div className="relative overflow-hidden rounded-2xl glass px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {strip.kind === "company" ? (
              <CompanyAvatar name={strip.title} accent={strip.accent} logoUrl={strip.logoUrl ?? null} size={30} rounded="rounded-lg" iconSize={14} />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent ring-1 ring-accent/25">
                {getInitials(strip.title)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{strip.title}</p>
              <p className="truncate text-[11px] text-fg-muted">{strip.sub}</p>
            </div>
            {strip.segments && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60">
                {strip.segments.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    scroll={false}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      s.active ? "bg-bg-elev text-accent shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {s.label}
                  </Link>
                ))}
              </span>
            )}
            {strip.kind === "person" && strip.remindTaskId != null && (strip.lateCount ?? 0) > 0 && (
              <button
                type="button"
                onClick={remindAll}
                disabled={reminding}
                className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft/60 px-3 py-1.5 text-[11px] font-semibold text-warn ring-1 ring-warn/25 transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                <BellRing size={12} /> Remind all {strip.lateCount} late
              </button>
            )}
            <Link
              href={strip.clearHref}
              scroll={false}
              aria-label="Clear this filter"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <X size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
