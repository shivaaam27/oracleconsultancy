"use client";

import { useMemo, useState } from "react";
import {
  Search, Mail, MessageCircle, Phone, AlertCircle, MoonStar, UserX,
  ChevronUp, ChevronDown, Filter,
} from "lucide-react";
import { TableShell, Th, Td, Badge } from "./ui";
import { PersonDrawerLink } from "./person-drawer-link";
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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "workload" ? "desc" : "asc"); }
  };

  return (
    <div className="space-y-4">
      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role, company…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-bg-subtle focus:outline-none focus:border-accent"
          />
        </div>
        <select
          value={companyFilter === "all" ? "all" : String(companyFilter)}
          onChange={(e) => setCompanyFilter(e.target.value === "all" ? "all" : parseInt(e.target.value, 10))}
          className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-subtle"
        >
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-subtle"
        >
          <option value="all">All Types</option>
          <option value="internal">Internal</option>
          <option value="external">External</option>
          <option value="expat">Expat</option>
        </select>
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
          const toneClass = active
            ? tone === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40"
              : tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
              : "bg-bg-elev text-fg border-border"
            : count === 0 ? "border-transparent text-fg-subtle"
            : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as FilterKind)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${toneClass}`}
            >
              <span className="font-semibold tabular">{count}</span>
              <span>{label}</span>
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

      {/* Table */}
      <TableShell>
        <table className="w-full min-w-[680px]">
          <thead>
            <tr>
              <SortableTh label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
              <SortableTh label="Company" active={sortKey === "company"} dir={sortDir} onClick={() => toggleSort("company")} />
              <Th>Role</Th>
              <Th>Contact</Th>
              <SortableTh label="Workload" active={sortKey === "workload"} dir={sortDir} onClick={() => toggleSort("workload")} align="right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const dim = !p.active || (p.snoozedUntil && p.snoozedUntil > new Date());
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "hover:bg-bg-subtle transition-colors group",
                    dim && "opacity-60"
                  )}
                >
                  <Td className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <PersonDrawerLink
                        id={p.id}
                        name={p.name}
                        className="text-left hover:text-accent transition-colors"
                      />
                      {p.personType !== "internal" && (
                        <Badge tone={p.personType === "expat" ? "info" : "default"}>
                          {p.personType === "expat" ? "Expat" : "External"}
                        </Badge>
                      )}
                      {!p.active && (
                        <span title="Inactive" className="text-fg-subtle shrink-0">
                          <UserX size={12} />
                        </span>
                      )}
                      {p.snoozedUntil && p.snoozedUntil > new Date() && (
                        <span title={`Snoozed until ${p.snoozedUntil.toLocaleDateString("en-GB")}`} className="text-warn shrink-0">
                          <MoonStar size={12} />
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-fg-muted">
                    <span>{p.companyName ?? "—"}</span>
                    {p.associations.length > 0 && (
                      <span
                        className="ml-1 text-xs text-fg-subtle"
                        title={p.associations
                          .map((a) => `${a.companyName ?? "?"}${a.relationship ? ` (${a.relationship})` : ""}`)
                          .join(", ")}
                      >
                        +{p.associations.length}
                      </span>
                    )}
                  </Td>
                  <Td className="text-fg-muted text-xs">{p.role ?? "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {p.preferredChannel && (
                        <Badge tone="info">{p.preferredChannel}</Badge>
                      )}
                      <div className="flex items-center gap-1.5">
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          title={p.email}
                          className="text-fg-subtle hover:text-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail size={13} />
                        </a>
                      )}
                      {p.whatsapp && (
                        <a
                          href={whatsappHref(p.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          title={p.whatsapp}
                          className="text-fg-subtle hover:text-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageCircle size={13} />
                        </a>
                      )}
                      {p.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          title={p.phone}
                          className="text-fg-subtle hover:text-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone size={13} />
                        </a>
                      )}
                      {!p.hasContact && (
                        <span title="No contact info on file" className="text-danger">
                          <AlertCircle size={13} />
                        </span>
                      )}
                      </div>
                    </div>
                  </Td>
                  <Td align="right">
                    <PersonDrawerLink
                      id={p.id}
                      name={`${p.workload.open}${p.workload.overdue ? ` · ${p.workload.overdue}↓` : ""}`}
                      className={cn(
                        "tabular font-medium text-sm hover:text-accent transition-colors",
                        p.workload.overdue > 0 ? "text-danger" :
                        p.workload.open >= 5 ? "text-warn" :
                        p.workload.open === 0 ? "text-fg-subtle" : "text-fg"
                      )}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-fg-muted text-sm">
          No people match these filters.
        </div>
      )}

      <p className="text-xs text-fg-subtle">
        Showing {filtered.length} of {people.length} · Workload column shows open tasks (overdue ↓ if any) · Click a name or workload number for full detail.
      </p>
    </div>
  );
}

function SortableTh({
  label, active, dir, onClick, align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <Th align={align}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-fg transition-colors",
          active ? "text-fg" : "text-fg-muted"
        )}
      >
        {label}
        {active && (dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </button>
    </Th>
  );
}
