"use client";
import { useEffect, useMemo, useState } from "react";
import type { OutboxDraft, Channel } from "@/lib/outbox-gen";
import { OutboxCard } from "./outbox-card";
import { Card } from "@/components/ui";
import { Search, X, Rows3, Rows2 } from "lucide-react";

const DENSITY_KEY = "cos-outbox-density";

type Filter = "all" | "critical" | "overdue" | "missing";

export type PendingItem = {
  draft: OutboxDraft;
  sentChannels: Channel[];
};

export function PendingList({ items, scopeName = null }: { items: PendingItem[]; scopeName?: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<string>("all");
  const [density, setDensity] = useState<"compact" | "expanded">("compact");

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

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(DENSITY_KEY)) as
      | "compact"
      | "expanded"
      | null;
    if (stored === "compact" || stored === "expanded") setDensity(stored);
  }, []);

  const toggleDensity = () => {
    const next = density === "compact" ? "expanded" : "compact";
    setDensity(next);
    if (typeof window !== "undefined") localStorage.setItem(DENSITY_KEY, next);
  };

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

        <button
          type="button"
          onClick={toggleDensity}
          title={`Density: ${density}`}
          className="ml-auto inline-flex items-center justify-center p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
        >
          {density === "compact" ? <Rows3 size={13} /> : <Rows2 size={13} />}
        </button>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="pl-7 pr-7 py-1 text-xs rounded-md border border-border bg-bg-elev focus:outline-none focus:border-accent w-48"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
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
          No drafts match these filters.
        </Card>
      ) : density === "compact" ? (
        <div className="space-y-1.5">
          {visible.map((a) => (
            <OutboxCard
              key={a.draft.recipientName}
              draft={a.draft}
              alreadySent={false}
              sentChannels={new Set(a.sentChannels)}
              scopeName={scopeName}
              compact
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((a) => (
            <OutboxCard
              key={a.draft.recipientName}
              draft={a.draft}
              alreadySent={false}
              sentChannels={new Set(a.sentChannels)}
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
    ? tone === "danger"
      ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
        : "bg-accent/15 text-fg border-accent/40"
    : count === 0
      ? "border-transparent text-fg-subtle cursor-not-allowed"
      : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted";
  return (
    <button
      type="button"
      onClick={count === 0 ? undefined : onClick}
      disabled={count === 0}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${cls}`}
    >
      <span className="font-semibold tabular">{count}</span>
      <span>{label}</span>
    </button>
  );
}
