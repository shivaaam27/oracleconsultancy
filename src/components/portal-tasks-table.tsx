"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Search, Users } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";

export type PortalTaskRow = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  companyName: string | null;
  ownerName: string | null;
  teamSize: number;
  mine: boolean;
  raisedByMe: boolean;
};

const OPEN_EXCLUDED = ["Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const selectCls =
  "rounded-xl bg-bg-subtle ring-1 ring-border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-accent/50";

type Scope = "all" | "mine" | "raised";

export function PortalTasksTable({
  rows,
  canRaise,
}: {
  rows: PortalTaskRow[];
  canRaise: boolean;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState("open");
  const [company, setCompany] = useState("");
  const [priority, setPriority] = useState("");

  const companies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.companyName).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const now = new Date();
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope === "mine" && !r.mine) return false;
      if (scope === "raised" && !r.raisedByMe) return false;
      if (status === "open" && OPEN_EXCLUDED.includes(r.status)) return false;
      if (status === "done" && !OPEN_EXCLUDED.includes(r.status)) return false;
      if (status !== "open" && status !== "done" && status !== "all" && r.status !== status) return false;
      if (company && r.companyName !== company) return false;
      if (priority && r.priority !== priority) return false;
      if (term) {
        const hay = `${r.code} ${r.actionItem} ${r.ownerName ?? ""} ${r.companyName ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, scope, status, company, priority]);

  const scopeTabs: Array<{ key: Scope; label: string }> = [
    { key: "all", label: "All" },
    { key: "mine", label: "Assigned to me" },
    ...(canRaise ? [{ key: "raised" as Scope, label: "I raised" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Scope tabs */}
      <div className="flex flex-wrap gap-1.5">
        {scopeTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              scope === t.key
                ? "bg-accent text-accent-fg"
                : "bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, task, person…"
            className="w-full rounded-xl bg-bg-subtle ring-1 ring-border pl-8 pr-3 py-1.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-accent/50"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Status">
          <option value="open">Open</option>
          <option value="all">All statuses</option>
          <option value="done">Completed / Closed</option>
          <option value="In Progress">In Progress</option>
          <option value="Under Review">Under Review</option>
          <option value="Blocked">Blocked</option>
          <option value="Waiting External">Waiting External</option>
          <option value="Escalated">Escalated</option>
          <option value="Not Started">Not Started</option>
        </select>
        {companies.length > 1 && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={selectCls} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-fg-subtle">{filtered.length} task{filtered.length === 1 ? "" : "s"}</p>

      {filtered.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">No tasks match these filters.</Panel>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => {
            const od = t.deadline && new Date(t.deadline) < now && !OPEN_EXCLUDED.includes(t.status);
            return (
              <Link key={t.id} href={`/portal/task/${t.code}`} className="block group">
                <Panel className="p-3.5 transition-shadow group-hover:ring-accent/40">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold tabular text-fg-muted">{t.code}</span>
                    {t.companyName && <span className="text-xs text-fg-subtle">· {t.companyName}</span>}
                    {t.raisedByMe && <Badge tone="default">Raised by me</Badge>}
                    <span className="grow" />
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug">{t.actionItem}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                    {t.ownerName && <span>Owner: {t.ownerName}</span>}
                    {t.teamSize > 1 && (
                      <span>
                        <Users size={12} className="mr-1 inline -mt-px" />
                        Team of {t.teamSize}
                      </span>
                    )}
                    {t.deadline && (
                      <span className={od ? "text-danger font-medium" : undefined}>
                        <CalendarDays size={12} className="mr-1 inline -mt-px" />
                        Due {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {od ? " · overdue" : ""}
                      </span>
                    )}
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
