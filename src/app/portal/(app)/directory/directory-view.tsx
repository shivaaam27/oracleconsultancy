"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/surface-kit";
import { cn } from "@/lib/cn";
import { Phone, MessageCircle, Mail, ArrowUpRight, Search, X, Building2, AlertTriangle } from "lucide-react";

const ICON = "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-transform active:scale-90";
const ICON_OFF = `${ICON} bg-bg-subtle/50 text-fg-subtle/40`;

export type DirectoryPerson = {
  id: number;
  name: string;
  role: string | null;
  companyId: number | null;
  company: string | null;
  callHref: string | null;
  waHref: string | null;
  mailtoHref: string | null;
};

export type DirectoryCompany = {
  id: number;
  name: string;
  headcount: number;
  open: number;
  overdue: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Read-only contact book for directors/HR (managers and staff see only their own
 *  company). Two tabs: People (searchable, with real call/WhatsApp/email anchors)
 *  and Companies (cards with headcount + open/overdue work). No pay or private IDs.
 *  `canOpenProfiles` hides the per-person profile arrow for staff, who can't open
 *  colleague profiles (the profile page guards them out). */
export function DirectoryView({
  people,
  companies,
  canOpenProfiles = true,
}: {
  people: DirectoryPerson[];
  companies: DirectoryCompany[];
  canOpenProfiles?: boolean;
}) {
  const [tab, setTab] = useState<"people" | "companies">("people");
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState<number | "all">("all");
  const ql = q.trim().toLowerCase();

  const shown = useMemo(() => {
    return people.filter((p) => {
      if (companyId !== "all" && p.companyId !== companyId) return false;
      if (!ql) return true;
      return `${p.name} ${p.role ?? ""} ${p.company ?? ""}`.toLowerCase().includes(ql);
    });
  }, [people, ql, companyId]);

  // Only offer the company filter when there's more than one company to pick from.
  const showCompanyFilter = companies.length > 1;

  return (
    <div className="space-y-4">
      {/* Segmented control */}
      <div className="inline-flex rounded-full bg-bg-subtle/60 p-1 ring-1 ring-border/40">
        {(["people", "companies"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-bg-elev text-fg shadow-sm ring-1 ring-border/50" : "text-fg-muted hover:text-fg",
            )}
          >
            {t}
            <span className="ml-1.5 text-[11px] text-fg-subtle">{t === "people" ? people.length : companies.length}</span>
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3.5 py-2.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
            <Search size={16} className="shrink-0 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, role or company…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {showCompanyFilter && (
            <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
              <FilterChip active={companyId === "all"} onClick={() => setCompanyId("all")}>
                All
              </FilterChip>
              {companies.map((c) => (
                <FilterChip key={c.id} active={companyId === c.id} onClick={() => setCompanyId(c.id)}>
                  {c.name}
                </FilterChip>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <Panel className="p-6 text-center text-sm text-fg-muted">No matches.</Panel>
          ) : (
            <Panel className="divide-y divide-border/40 overflow-hidden p-0">
              {shown.map((p) => (
                <PersonRow key={p.id} p={p} canOpenProfile={canOpenProfiles} />
              ))}
            </Panel>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {companies.length === 0 ? (
            <Panel className="p-6 text-center text-sm text-fg-muted sm:col-span-2">No companies.</Panel>
          ) : (
            companies.map((c) => <CompanyCard key={c.id} c={c} />)
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-accent text-accent-fg" : "bg-bg-subtle/60 text-fg-muted ring-1 ring-border/40 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function PersonRow({ p, canOpenProfile }: { p: DirectoryPerson; canOpenProfile: boolean }) {
  const first = p.name.split(" ")[0];
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
        {initials(p.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-[11px] text-fg-muted">{[p.role, p.company].filter(Boolean).join(" · ") || "—"}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {p.callHref ? (
          <a href={p.callHref} title={`Call ${first}`} aria-label={`Call ${first}`} className={`${ICON} bg-bg-subtle text-fg-muted`}>
            <Phone size={15} />
          </a>
        ) : (
          <span title="No phone on file" className={ICON_OFF}>
            <Phone size={15} />
          </span>
        )}

        {p.waHref ? (
          <a
            href={p.waHref}
            target="_blank"
            rel="noreferrer"
            title={`WhatsApp ${first}`}
            aria-label={`WhatsApp ${first}`}
            className={`${ICON} bg-success-soft text-success`}
          >
            <MessageCircle size={15} />
          </a>
        ) : (
          <span title="No WhatsApp number on file" className={ICON_OFF}>
            <MessageCircle size={15} />
          </span>
        )}

        {p.mailtoHref ? (
          <a href={p.mailtoHref} title={`Email ${first}`} aria-label={`Email ${first}`} className={`${ICON} bg-accent-soft text-accent`}>
            <Mail size={15} />
          </a>
        ) : (
          <span title="No email address on file" className={ICON_OFF}>
            <Mail size={15} />
          </span>
        )}

        {canOpenProfile && (
          <Link
            href={`/portal/people/${p.id}`}
            title={`Open ${first}'s profile`}
            aria-label={`Open ${first}'s profile`}
            className={`${ICON} bg-accent text-accent-fg`}
          >
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}

function CompanyCard({ c }: { c: DirectoryCompany }) {
  return (
    <Link href={`/portal/companies/${c.id}`} className="group block">
      <Panel className="flex items-center gap-3 p-3.5 transition-shadow group-hover:ring-2 group-hover:ring-accent/30">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Building2 size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium group-hover:text-accent">{c.name}</p>
          <p className="truncate text-[11px] text-fg-muted">
            {c.headcount} {c.headcount === 1 ? "person" : "people"} · {c.open} open
            {c.overdue > 0 && (
              <span className="text-danger">
                {" "}
                · {c.overdue} overdue
              </span>
            )}
          </p>
        </div>
        {c.overdue > 0 ? (
          <AlertTriangle size={15} className="shrink-0 text-danger" />
        ) : (
          <ArrowUpRight size={16} className="shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
        )}
      </Panel>
    </Link>
  );
}
