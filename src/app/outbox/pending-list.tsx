"use client";
import { useMemo, useState } from "react";
import type { OutboxDraft, Channel } from "@/lib/outbox-gen";
import { OutboxCard } from "./outbox-card";
import { Card } from "@/components/ui";
import { Search, X } from "lucide-react";

type Filter = "all" | "critical" | "overdue" | "missing";

export type PendingItem = {
  draft: OutboxDraft;
  sentChannels: Channel[];
};

export function PendingList({ items, scopeName = null }: { items: PendingItem[]; scopeName?: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<string>("all");

  // Company list with recipient counts (a person counts once per company they touch).
  const companyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      const seen = new Set<string>();
      for (const t of i.draft.tasks) {
        if (seen.has(t.companyName)) continue;
        seen.add(t.companyName);
        m.set(t.companyName, (m.get(t.companyName) || 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const counts = useMemo(() => {
    const all = items.length;
    const critical = items.filter((i) => i.draft.tasks.some((t) => t.priority === "Critical")).length;
    const overdue = items.filter((i) =>
      i.draft.tasks.some((t) => t.flag === "overdue" || t.flag === "escalate-now")
    ).length;
    const missing = items.filter((i) => i.draft.contactStatus !== "Complete").length;
    return { all, critical, overdue, missing };
  }, [items]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "critical" && !i.draft.tasks.some((t) => t.priority === "Critical")) return false;
      if (filter === "overdue" && !i.draft.tasks.some((t) => t.flag === "overdue" || t.flag === "escalate-now")) return false;
      if (filter === "missing" && i.draft.contactStatus === "Complete") return false;
      if (company !== "all" && !i.draft.tasks.some((t) => t.companyName === company)) return false;
      if (query && !i.draft.recipientName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, filter, q, company]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} tone="default" />
        <Chip label="Critical" count={counts.critical} active={filter === "critical"} onClick={() => setFilter(filter === "critical" ? "all" : "critical")} tone="danger" />
        <Chip label="Overdue" count={counts.overdue} active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} tone="danger" />
        <Chip label="Missing contact" count={counts.missing} active={filter === "missing"} onClick={() => setFilter(filter === "missing" ? "all" : "missing")} tone="warn" />

        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className={`text-xs rounded-full border px-2.5 py-1 cursor-pointer transition-colors ${
            company !== "all"
              ? "border-accent/40 bg-accent/10 text-fg"
              : "border-border bg-bg-elev text-fg-muted hover:text-fg"
          }`}
          title="Filter by company"
        >
          <option value="all">All companies ({items.length})</option>
          {companyCounts.map(([name, n]) => (
            <option key={name} value={name}>
              {name === scopeName ? `★ ${name}` : name} ({n})
            </option>
          ))}
        </select>

        {/* Search — right-aligned */}
        <div className="relative ml-auto flex-1 sm:flex-none min-w-[8rem]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full sm:w-44 pl-8 pr-7 py-1.5 text-xs rounded-full border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {(company !== "all" || filter !== "all" || q.trim()) && (
        <p className="text-xs text-fg-muted">
          Showing {visible.length} of {items.length} recipients
          {company !== "all" && <> · <strong className="text-fg">{company}</strong></>}
        </p>
      )}

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-fg-muted">
          No reminders match these filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <OutboxCard
              key={a.draft.recipientName}
              draft={a.draft}
              alreadySent={false}
              scopeName={scopeName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: "default" | "danger" | "warn";
}) {
  const cls = active
    ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
      : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
      : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
    : count === 0
      ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle cursor-not-allowed"
      : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
      : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
      : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
  return (
    <button
      type="button"
      onClick={count === 0 ? undefined : onClick}
      disabled={count === 0}
      className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[11px] rounded-full transition-all backdrop-blur-md hover:shadow-sm ${cls}`}
    >
      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/30 dark:bg-black/20 font-semibold tabular">
        {count}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
