"use client";
import { useEffect, useMemo, useState } from "react";
import type { OutboxDraft } from "@/lib/outbox-gen";
import { OutboxCard } from "./outbox-card";
import { Card } from "@/components/ui";
import { Search, X, Rows3, Rows2 } from "lucide-react";

const DENSITY_KEY = "cos-outbox-density";

type Channel = "WHATSAPP" | "EMAIL" | "SMS";
type Filter = "all" | "critical" | "overdue" | "missing";

type Item = { draft: OutboxDraft; alreadySent: boolean };

export function PendingList({ items, channel }: { items: Item[]; channel: Channel }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [density, setDensity] = useState<"compact" | "expanded">("compact");

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
    const critical = items.filter((i) =>
      i.draft.tasks.some((t) => t.priority === "Critical")
    ).length;
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
      if (query && !i.draft.recipientName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, filter, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} tone="default" />
        <Chip label="Critical" count={counts.critical} active={filter === "critical"} onClick={() => setFilter(filter === "critical" ? "all" : "critical")} tone="danger" />
        <Chip label="Overdue" count={counts.overdue} active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} tone="danger" />
        <Chip label="Missing contact" count={counts.missing} active={filter === "missing"} onClick={() => setFilter(filter === "missing" ? "all" : "missing")} tone="warn" />
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
              channel={channel}
              alreadySent={false}
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
              channel={channel}
              alreadySent={false}
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
