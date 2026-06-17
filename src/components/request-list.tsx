"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, CalendarDays, FileText, Laptop, Users, Banknote, Plane, Settings2, Inbox,
  MonitorSmartphone, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Switch } from "./ui";
import {
  isRequestOpen,
  partiesLabel,
  requestAging,
  requestStatusLabel,
  requestStatusTone,
  type RequestRow,
} from "@/lib/requests-shared";

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Map a request category to a meaning icon for its card tile. */
function catIcon(cat: string | null): LucideIcon {
  const c = (cat ?? "").toLowerCase();
  if (/leave|holiday|time off|absence/.test(c)) return CalendarDays;
  if (/doc|letter|certificate|passport|visa|contract/.test(c)) return FileText;
  if (/equip|laptop|device|hardware|asset|tool/.test(c)) return Laptop;
  if (/hr|payroll|salary|people/.test(c)) return Users;
  if (/it|tech|system|access|software/.test(c)) return MonitorSmartphone;
  if (/finance|expense|payment|reimburse|advance/.test(c)) return Banknote;
  if (/travel|trip|flight|transport/.test(c)) return Plane;
  if (/admin|office|facilit/.test(c)) return Settings2;
  return Inbox;
}

type Tab = "to_me" | "raised" | "all";

/** Shared request list. Portal passes meId (enables To-me / I-raised tabs);
 *  the owner inbox passes scope="admin" (status filter + "awaiting you"). */
export function RequestList({
  rows,
  base,
  meId,
  scope = "portal",
}: {
  rows: RequestRow[];
  base: string;
  meId?: number;
  scope?: "portal" | "admin";
}) {
  const [tab, setTab] = useState<Tab>(scope === "admin" ? "all" : "to_me");
  const [openOnly, setOpenOnly] = useState(false);
  const [q, setQ] = useState("");

  const isToMe = (r: RequestRow) =>
    scope === "admin" ? r.recipients.some((p) => p.isOwner) : r.recipients.some((p) => p.id === meId);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "to_me" && !isToMe(r)) return false;
      if (tab === "raised" && r.requesterId !== meId) return false;
      if (openOnly && !isRequestOpen(r.status)) return false;
      if (query) {
        const hay = `${r.code} ${r.title} ${r.requesterName} ${r.recipients.map((p) => p.name).join(" ")} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, tab, openOnly, scope, meId]);

  const toMeOpen = useMemo(() => rows.filter((r) => isToMe(r) && isRequestOpen(r.status)).length, [rows, scope, meId]);

  const tabs: { id: Tab; label: string; badge?: number }[] =
    scope === "admin"
      ? [
          { id: "all", label: "All" },
          { id: "to_me", label: "Awaiting you", badge: toMeOpen },
        ]
      : [
          { id: "to_me", label: "To me", badge: toMeOpen },
          { id: "raised", label: "I raised" },
          { id: "all", label: "All" },
        ];
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.id === tab));

  return (
    <div className="flex flex-col gap-3">
      {/* iOS segmented control with a sliding active indicator. */}
      <div className="relative grid gap-0 rounded-2xl bg-bg-subtle p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-xl bg-bg-elev shadow-sm ring-1 ring-border transition-transform duration-300 ease-[var(--ease-spring)]"
          style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${activeIdx * 100}%)` }}
        />
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn("relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] transition-colors", active ? "font-medium text-fg" : "text-fg-muted")}
            >
              {t.label}
              {t.badge ? (
                <span className={cn("inline-flex min-w-[16px] justify-center rounded-full px-1 text-[10px] font-semibold", active ? "bg-accent text-accent-fg" : "bg-bg-muted text-fg-subtle")}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
          <Search size={15} className="shrink-0 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search requests…"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm placeholder:text-fg-muted focus:outline-none"
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={openOnly}
          onClick={() => setOpenOnly((v) => !v)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-bg-elev px-3 py-2 text-[12.5px] text-fg-muted ring-1 ring-border transition-transform active:scale-95"
        >
          <span className="hidden sm:inline">Open only</span>
          <Switch on={openOnly} size="sm" />
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-bg-elev px-4 py-8 text-center text-sm text-fg-muted ring-1 ring-border">No requests here yet.</p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
          {filtered.map((r) => {
            const unseen = scope === "admin" && r.recipients.some((p) => p.isOwner) && !r.seen && isRequestOpen(r.status);
            const fromLabel = r.requesterIsOwner ? "Oracle Consultancy" : r.requesterName;
            const Icon = catIcon(r.category);
            const age = requestAging(r.createdAt, r.status, Date.now());
            const closed = !isRequestOpen(r.status);
            return (
              <Link
                key={r.id}
                href={`${base}/${r.id}`}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl bg-bg-elev p-3 ring-1 ring-border transition-all hover:ring-2 hover:ring-accent/30 active:scale-[0.99]",
                  closed && "opacity-70"
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft/70 text-accent">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {unseen && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
                    <span className="truncate text-sm font-medium">{r.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
                    {r.code} · {r.category ?? "Request"} · {fromLabel} → {partiesLabel(r.recipients, scope === "admin")}
                    {r.companyName ? ` · ${r.companyName}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel(r.status)}</Badge>
                  {age ? <Badge tone={age.tone}>{age.days}d open</Badge> : null}
                  <span className="text-[10px] text-fg-subtle">{ago(r.updatedAt)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
