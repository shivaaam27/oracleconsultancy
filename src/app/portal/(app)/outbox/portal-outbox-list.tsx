"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Send, ChevronDown, ChevronRight, Search, X, AlertTriangle } from "lucide-react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { NotifyPerson } from "@/components/notify-person";
import { getInitials } from "@/lib/names";
import { cn } from "@/lib/cn";

export type OutboxTask = {
  code: string;
  title: string;
  company: string;
  status: string;
  priority: string;
  due: string | null;
  overdue: boolean;
  accountable: string[];
};

export type OutboxPerson = {
  personId: number;
  name: string;
  total: number;
  overdue: number;
  companies: string[];
  tasks: OutboxTask[];
};

function dot(t: OutboxTask): string {
  if (t.overdue || t.priority === "Critical") return "bg-danger";
  if (t.priority === "High" || t.priority === "Medium") return "bg-warn";
  return "bg-border-strong";
}

/** One person: avatar + counts; expands to their full task list + send actions. */
function PersonCard({ p }: { p: OutboxPerson }) {
  // Every card starts collapsed — only the user expands the person they want.
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-bg-subtle/40"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {getInitials(p.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
          <span className="text-xs text-fg-subtle">
            {p.total} open task{p.total === 1 ? "" : "s"}
            {p.overdue > 0 && <span className="text-danger"> · {p.overdue} overdue</span>}
            {p.companies.length > 0 && <> · {p.companies.slice(0, 2).join(", ")}{p.companies.length > 2 ? "…" : ""}</>}
          </span>
        </span>
        {p.overdue > 0 && <AlertTriangle size={14} className="shrink-0 text-danger" />}
        <ChevronDown size={16} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border/50 bg-bg-subtle/20 px-3.5 py-3">
          <ul className="space-y-1">
            {p.tasks.map((t, i) => (
              <li key={i}>
                <Link
                  href={`/portal/task/${t.code}`}
                  className="group flex items-start gap-2 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-bg-elev/70"
                >
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot(t))} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium leading-tight text-fg group-hover:text-accent transition-colors">{t.title}</span>
                    <span className="text-xs text-fg-subtle">
                      {[t.company, t.status, t.due ? `due ${t.due}` : null].filter(Boolean).join(" · ")}
                      {t.accountable.length > 1 && ` · ${t.accountable.join(", ")}`}
                    </span>
                  </span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-fg-subtle/50 group-hover:text-accent transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
          {/* Send the whole list (group-wise, as normal) or scope per task from the task page. */}
          <div className="mt-3">
            <NotifyPerson personId={p.personId} name={p.name} size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}

export function PortalOutboxLive({ people }: { people: OutboxPerson[] }) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return people;
    return people.filter((p) => p.name.toLowerCase().includes(query) || p.companies.some((c) => c.toLowerCase().includes(query)));
  }, [people, q]);

  if (people.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <Send size={20} className="mx-auto mb-2 text-fg-subtle" />
        <p className="text-sm text-fg-muted">Everyone's clear — no open tasks to chase.</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel
        icon={<Send size={13} />}
        action={
          <div className="relative w-40">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a person…"
              className="w-full rounded-full border border-border bg-bg-subtle/60 py-1 pl-7 pr-6 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear">
                <X size={10} />
              </button>
            )}
          </div>
        }
      >
        Outreach — by person
      </SectionLabel>

      <Panel className="divide-y divide-border/70 overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-muted">No one matches “{q}”.</p>
        ) : (
          shown.map((p) => <PersonCard key={p.personId} p={p} />)
        )}
      </Panel>
    </div>
  );
}
