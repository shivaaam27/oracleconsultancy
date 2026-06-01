"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, RotateCcw, Check } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { Card } from "./ui";
import { CompanyJump } from "./company-jump";
import { FilterSelect } from "./filter-select";

type Props = {
  view: string;
  q: string;
  company?: string;
  priority?: string;
  status?: string;
  flag?: string;
  noOwner?: string;
  closed?: string;
  month?: string;
  companies: Array<{ id: number; name: string }>;
  priorities: string[];
  statuses: string[];
  showClosed: boolean;
  closedCount: number;
  resetHref: string;
  toggleClosedHref: string;
  /** Number of active narrowing filters — shown on the mobile button badge. */
  activeCount: number;
};

/**
 * Task filter bar. On desktop it's the familiar inline glass card. On mobile the
 * whole thing collapses behind a single "Filters" button (with an active-count
 * badge) that opens a bottom sheet — so the task list isn't buried under controls.
 */
export function TaskFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    view, q, company, priority, status, flag, noOwner, closed, month,
    companies, priorities, statuses, showClosed, closedCount, resetHref, toggleClosedHref, activeCount,
  } = props;

  // Tap-to-select inside the mobile sheet — preserves every other filter, no
  // nested popovers to get clipped. Sheet stays open so multiple picks feel live.
  function setParam(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    params.set("tab", "tasks");
    router.push(`/?${params.toString()}`, { scroll: false });
  }
  function jumpCompany(id: string) {
    if (id) router.push(`/companies/${id}`);
    else router.push("/?tab=tasks");
    setOpen(false);
  }

  // Hidden inputs preserve every other filter when the search box submits.
  const hidden = (
    <>
      <input type="hidden" name="tab" value="tasks" />
      {flag && <input type="hidden" name="flag" value={flag} />}
      {noOwner && <input type="hidden" name="noOwner" value={noOwner} />}
      {closed && <input type="hidden" name="closed" value={closed} />}
      {view && view !== "board" && <input type="hidden" name="view" value={view} />}
      {month && <input type="hidden" name="month" value={month} />}
      {company && <input type="hidden" name="company" value={company} />}
      {priority && <input type="hidden" name="priority" value={priority} />}
      {status && <input type="hidden" name="status" value={status} />}
    </>
  );

  const priorityOpts = [{ value: "", label: "All Priorities" }, ...priorities.map((p) => ({ value: p, label: p }))];
  const statusOpts = [{ value: "", label: "All Statuses" }, ...statuses.map((s) => ({ value: s, label: s }))];

  return (
    <>
      {/* Desktop — inline glass card (unchanged) */}
      <Card className="p-3 hidden sm:block">
        <form className="flex flex-wrap gap-2 items-center">
          {hidden}
          {view === "table" && (
            <input
              name="q"
              defaultValue={q}
              placeholder="Search action item, code, or person…"
              className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-md"
            />
          )}
          <CompanyJump value="" companies={companies} />
          <FilterSelect param="priority" value={priority || ""} placeholder="All Priorities" options={priorityOpts} />
          <FilterSelect param="status" value={status || ""} placeholder="All Statuses" options={statusOpts} />
          {activeCount > 0 && (
            <Link href={resetHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
              Reset
            </Link>
          )}
          <Link
            href={toggleClosedHref}
            className={`px-2 py-1 rounded-md text-xs ${showClosed ? "bg-bg-muted text-fg" : "text-fg-muted hover:bg-bg-muted"}`}
          >
            {showClosed ? "✓ " : ""}Show closed ({closedCount})
          </Link>
        </form>
      </Card>

      {/* Mobile — a single Filters button + search, the rest in a bottom sheet */}
      <div className="sm:hidden flex items-center gap-2">
        {view === "table" && (
          <form className="flex-1 min-w-0">
            {hidden}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search tasks…"
              className="w-full px-3 py-2 text-sm rounded-xl"
            />
          </form>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass elevated text-sm text-fg-muted active:scale-[0.97] transition-transform"
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-fg text-[10px] font-semibold tabular">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[88] bg-black/45 backdrop-blur-[3px] sm:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={spring}
              className="fixed z-[89] inset-x-0 bottom-0 sm:hidden"
            >
              <div className="glass glass-menu rounded-t-3xl overflow-hidden pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                  <span className="text-sm font-semibold">Filters</span>
                  <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-fg-muted hover:text-fg" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <PillGroup label="Priority">
                    <Pill active={!priority} onClick={() => setParam("priority", "")}>All</Pill>
                    {priorities.map((p) => (
                      <Pill key={p} active={priority === p} onClick={() => setParam("priority", p)}>{p}</Pill>
                    ))}
                  </PillGroup>
                  <PillGroup label="Status">
                    <Pill active={!status} onClick={() => setParam("status", "")}>All</Pill>
                    {statuses.map((s) => (
                      <Pill key={s} active={status === s} onClick={() => setParam("status", s)}>{s}</Pill>
                    ))}
                  </PillGroup>
                  <PillGroup label="Company">
                    <Pill active={!company} onClick={() => jumpCompany("")}>All</Pill>
                    {companies.map((c) => (
                      <Pill key={c.id} active={company === c.name} onClick={() => jumpCompany(String(c.id))}>{c.name}</Pill>
                    ))}
                  </PillGroup>
                  <Link
                    href={toggleClosedHref}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm ${showClosed ? "bg-bg-muted text-fg" : "bg-bg-subtle/60 text-fg-muted"}`}
                  >
                    <span>Show closed tasks ({closedCount})</span>
                    {showClosed && <Check size={16} className="text-accent" />}
                  </Link>
                </div>
                <div className="flex items-center gap-2 px-4 py-3 border-t border-border/60">
                  {activeCount > 0 && (
                    <Link
                      href={resetHref}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-fg-muted hover:text-fg bg-bg-subtle/60"
                    >
                      <RotateCcw size={14} /> Reset
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium bg-accent text-accent-fg active:opacity-90"
                  >
                    Show {activeCount > 0 ? "results" : "tasks"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</label>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm transition-colors active:scale-[0.97]",
        active
          ? "bg-accent text-accent-fg font-medium shadow-sm"
          : "bg-bg-subtle/70 text-fg-muted hover:text-fg hover:bg-bg-muted"
      )}
    >
      {children}
    </button>
  );
}
