"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, MessageCircle, Filter, ExternalLink, ListTodo } from "lucide-react";
import { PersonCard } from "./person-card";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { FluidSelect } from "./fluid-select";
import { triggerHaptic } from "@/lib/use-long-press";
import { cn } from "@/lib/cn";
import type { PersonRow } from "@/lib/people-queries";

type SortKey = "name" | "company" | "workload";
type SortDir = "asc" | "desc";

type FilterKind = "all" | "noContact" | "snoozed" | "inactive" | "overloaded";

function whatsappHref(num: string) {
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

export function PeopleTable({ people, companies }: {
  people: PersonRow[];
  companies: Array<{ id: number; name: string }>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external" | "expat">("all");
  const [sortKey, setSortKey] = useState<SortKey>("workload");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showInactive, setShowInactive] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [peek, setPeek] = useState<PersonRow | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function openPerson(id: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id));
    params.delete("task");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onRowPointerDown(p: PersonRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(p); }, 400);
  }
  function onRowPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }
  const peekActions = (p: PersonRow): PeekAction[] => [
    { label: "Open profile", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openPerson(p.id) },
    { label: "View tasks", icon: <ListTodo size={15} />, onClick: () => router.push(`/?tab=tasks&all=1&q=${encodeURIComponent(p.name)}`) },
    ...(p.whatsapp ? [{ label: "Message on WhatsApp", icon: <MessageCircle size={15} />, onClick: () => window.open(whatsappHref(p.whatsapp!), "_blank") }] : []),
  ];

  const filtered = useMemo(() => {
    const now = new Date();
    let rows = people.slice();

    // Active filter
    if (!showInactive && filter !== "inactive") {
      rows = rows.filter((p) => p.active);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.role?.toLowerCase().includes(q) ?? false) ||
        (p.companyName?.toLowerCase().includes(q) ?? false)
      );
    }

    // Company filter — match primary company OR an associated company link
    if (companyFilter !== "all") {
      rows = rows.filter(
        (p) => p.companyId === companyFilter || p.associations.some((a) => a.companyId === companyFilter)
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      rows = rows.filter((p) => p.personType === typeFilter);
    }

    // Filter chip
    if (filter === "noContact") rows = rows.filter((p) => !p.hasContact);
    if (filter === "snoozed") rows = rows.filter((p) => p.snoozedUntil && p.snoozedUntil > now);
    if (filter === "inactive") rows = rows.filter((p) => !p.active);
    if (filter === "overloaded") rows = rows.filter((p) => p.workload.open >= 5);

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "company") cmp = (a.companyName ?? "").localeCompare(b.companyName ?? "");
      else cmp = a.workload.open - b.workload.open;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [people, search, filter, companyFilter, typeFilter, sortKey, sortDir, showInactive]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: people.filter((p) => p.active).length,
      noContact: people.filter((p) => p.active && !p.hasContact).length,
      snoozed: people.filter((p) => p.active && p.snoozedUntil && p.snoozedUntil > now).length,
      inactive: people.filter((p) => !p.active).length,
      overloaded: people.filter((p) => p.active && p.workload.open >= 5).length,
    };
  }, [people]);

  return (
    <div className="space-y-4">
      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role, company…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <FluidSelect
          value={companyFilter === "all" ? "all" : String(companyFilter)}
          onSelect={(v) => setCompanyFilter(v === "all" ? "all" : parseInt(v, 10))}
          options={[{ value: "all", label: "All Companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <FluidSelect
          value={typeFilter}
          onSelect={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { value: "all", label: "All Types" },
            { value: "internal", label: "Internal" },
            { value: "external", label: "External" },
            { value: "expat", label: "Expat" },
          ]}
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter size={11} className="text-fg-subtle" />
        {[
          { key: "all", label: "All", count: counts.all, tone: "default" as const },
          { key: "noContact", label: "No contact info", count: counts.noContact, tone: "danger" as const },
          { key: "snoozed", label: "Snoozed", count: counts.snoozed, tone: "warn" as const },
          { key: "overloaded", label: "Overloaded (5+)", count: counts.overloaded, tone: "warn" as const },
          { key: "inactive", label: "Inactive", count: counts.inactive, tone: "default" as const },
        ].map(({ key, label, count, tone }) => {
          const active = filter === key;
          const tint = active
            ? tone === "danger" ? "bg-danger-soft/70 ring-2 ring-danger/40 text-danger"
              : tone === "warn" ? "bg-warn-soft/70 ring-2 ring-warn/40 text-warn"
              : "bg-accent-soft/70 ring-2 ring-accent/40 text-accent"
            : count === 0 ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
            : tone === "danger" ? "bg-danger-soft/50 ring-1 ring-danger/25 text-danger hover:ring-2"
            : tone === "warn" ? "bg-warn-soft/50 ring-1 ring-warn/25 text-warn hover:ring-2"
            : "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-muted hover:ring-2 hover:ring-border";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as FilterKind)}
              className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm ${tint}`}
            >
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/30 dark:bg-black/20 font-semibold tabular">
                {count}
              </span>
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-accent"
          />
          Show inactive in list
        </label>
      </div>

      {/* Card grid — same on mobile + desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {filtered.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            onOpen={() => { if (longPressed.current) { longPressed.current = false; return; } openPerson(p.id); }}
            onPointerDown={(e) => onRowPointerDown(p, e)}
            onPointerMove={onRowPointerMove}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
          />
        ))}
      </div>

      {/* Long-press peek — limited details */}
      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openPerson(peek.id) : undefined}
        title={peek?.name}
        subtitle={peek ? [peek.companyName, peek.role].filter(Boolean).join(" · ") || undefined : undefined}
        pills={peek ? (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-info-soft/60 ring-1 ring-info/25 text-info tabular">{peek.workload.open} open</span>
            {peek.workload.overdue > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger tabular">{peek.workload.overdue} overdue</span>}
            {peek.workload.dueSoon > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warn-soft/60 ring-1 ring-warn/25 text-warn tabular">{peek.workload.dueSoon} due soon</span>}
            {!peek.hasContact && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger">No contact</span>}
          </>
        ) : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      {filtered.length === 0 && (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">
          No people match these filters.
        </div>
      )}

      <p className="text-xs text-fg-subtle px-1">
        Showing {filtered.length} of {people.length} · tap a card for full detail · hover to preview workload.
      </p>
    </div>
  );
}
