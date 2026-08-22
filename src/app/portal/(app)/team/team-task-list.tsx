"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type TeamTask = {
  code: string;
  title: string;
  company: string;
  status: string;
  priority: string;
  dueLabel: string | null;
  overdueDays: number | null;
  description: string | null;
  latest: string | null;
  responsible: string[];
};

/** A teammate's open tasks on the Team view: a 5-line preview that expands to
 *  every task with full detail (status · priority · due · overdue · responsible ·
 *  description · latest update). When expanded the list lives in its OWN scroll
 *  box (a few tasks tall) so the page doesn't balloon, with a "Show less" at the
 *  top and bottom for easy collapse. */
export function TeamTaskList({ items }: { items: TeamTask[] }) {
  const [open, setOpen] = useState(false);
  const preview = items.slice(0, 5);

  const Collapse = ({ className = "" }: { className?: string }) => (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className={`inline-flex items-center gap-1 text-xs text-accent hover:underline ${className}`}
    >
      <ChevronDown size={12} className="rotate-180" /> Show less
    </button>
  );

  if (!open) {
    return (
      <div>
        <ul className="space-y-1 text-xs text-fg-muted">
          {preview.map((t) => (
            <li key={t.code} className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.overdueDays != null ? "bg-danger" : "bg-border-strong"}`} />
              <span className="truncate">{t.title}</span>
              <span className="ml-auto shrink-0 text-fg-subtle">{t.company}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <ChevronDown size={12} /> {items.length > 5 ? `Read all ${items.length} tasks` : "Read full detail"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">All {items.length} tasks</span>
        <Collapse />
      </div>
      <ul className="max-h-[17rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
        {items.map((t) => (
          <li key={t.code} className="rounded-xl bg-bg-subtle/40 p-2.5 ring-1 ring-border/40">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-fg">{t.title}</span>
              {t.overdueDays != null ? (
                <span className="shrink-0 text-xs font-medium text-danger">⚠️ {t.overdueDays}d overdue</span>
              ) : t.dueLabel ? (
                <span className="shrink-0 text-xs text-fg-subtle">{t.dueLabel}</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
              <span>{t.company}</span>
              <span>· {t.status}</span>
              <span>· {t.priority}</span>
              {!t.overdueDays && t.dueLabel && <span>· due {t.dueLabel}</span>}
              {t.responsible.length > 1 && <span>· {t.responsible.join(", ")}</span>}
            </div>
            {t.description && <p className="mt-1 text-xs leading-snug text-fg-muted">{t.description}</p>}
            {t.latest && <p className="mt-0.5 text-xs leading-snug text-fg-subtle">Latest: {t.latest}</p>}
          </li>
        ))}
      </ul>
      <Collapse className="mt-2" />
    </div>
  );
}
