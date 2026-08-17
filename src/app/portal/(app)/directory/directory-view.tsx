"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getInitials as initials } from "@/lib/names";
import { CompanyAvatar } from "@/components/company-avatar";
import { ATTENDANCE_TONE } from "@/lib/leave-shared";
import { Phone, MessageCircle, Mail, ArrowUpRight, Search, X, AlertTriangle } from "lucide-react";

const ICON = "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-transform active:scale-90";
const ICON_OFF = `${ICON} bg-bg-subtle/50 text-fg-subtle/40`;

export type DirectoryPerson = {
  id: number;
  name: string;
  role: string | null;
  companyId: number | null;
  /** Every company this person belongs to (primary ∪ person_companies). A
   *  multi-company colleague filters under each one, not just their primary. */
  companyIds?: number[];
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
  logoUrl: string | null;
};

export type DirectoryAttendance = {
  id: number;
  name: string;
  status: string | null; // Present / Remote / Absent / On leave / Holiday / Half-day / Sick / null
  company: string | null;
  companyIds: number[];
};

/** Read-only contact book for directors/HR (managers and staff see only their own
 *  company). Two tabs: People (searchable, with real call/WhatsApp/email anchors)
 *  and Companies (cards with headcount + open/overdue work). No pay or private IDs.
 *  `canOpenProfiles` hides the per-person profile arrow for staff, who can't open
 *  colleague profiles (the profile page guards them out). */
export function DirectoryView({
  people,
  companies,
  attendance = [],
  showAttendance = false,
  canOpenProfiles = true,
  initialTab,
}: {
  people: DirectoryPerson[];
  companies: DirectoryCompany[];
  attendance?: DirectoryAttendance[];
  showAttendance?: boolean;
  canOpenProfiles?: boolean;
  /** Which tab to open on (from `?tab=`), so coming BACK from a company lands
   *  on the Companies list you were browsing rather than resetting to People. */
  initialTab?: string;
}) {
  type Tab = "people" | "companies" | "attendance";
  const tabs: Tab[] = showAttendance ? ["people", "companies", "attendance"] : ["people", "companies"];
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(
    tabs.includes(initialTab as Tab) ? (initialTab as Tab) : "people"
  );

  /** Switch tab AND put it in the URL, so a back-link can return you here. */
  function selectTab(t: Tab) {
    setTab(t);
    router.replace(t === "people" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState<number | "all">("all");
  const ql = q.trim().toLowerCase();
  // Render the first slice of people only; "Show all" reveals the rest. Keeps a
  // big directory from painting hundreds of rows at once. Resets on search/filter.
  const PEOPLE_CAP = 50;
  const [showAllPeople, setShowAllPeople] = useState(false);
  useEffect(() => { setShowAllPeople(false); }, [ql, companyId]);

  const shown = useMemo(() => {
    return people.filter((p) => {
      if (companyId !== "all") {
        // Match on the person's full company set (a multi-company colleague shows
        // under each of their companies), falling back to the primary company.
        const cids = p.companyIds ?? (p.companyId != null ? [p.companyId] : []);
        if (!cids.includes(companyId)) return false;
      }
      if (!ql) return true;
      return `${p.name} ${p.role ?? ""} ${p.company ?? ""}`.toLowerCase().includes(ql);
    });
  }, [people, ql, companyId]);

  // Attendance today, filtered by the same search + company chips as People.
  const shownAttendance = useMemo(() => {
    return attendance.filter((a) => {
      if (companyId !== "all") {
        const cids = a.companyIds ?? [];
        if (!cids.includes(companyId)) return false;
      }
      if (!ql) return true;
      return `${a.name} ${a.company ?? ""} ${a.status ?? ""}`.toLowerCase().includes(ql);
    });
  }, [attendance, ql, companyId]);
  const presentCount = shownAttendance.filter((a) => a.status === "Present" || a.status === "Remote").length;
  const markedCount = shownAttendance.filter((a) => a.status).length;

  const tabCount = (t: Tab) => (t === "people" ? people.length : t === "companies" ? companies.length : attendance.length);

  // Only offer the company filter when there's more than one company to pick from.
  const showCompanyFilter = companies.length > 1;

  return (
    <div className="space-y-4">
      {/* Segmented control */}
      <div className="inline-flex rounded-md bg-bg-subtle/60 p-0.5 ring-1 ring-border/40">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={cn(
              "inline-flex h-7 items-center rounded px-3 text-[13px] font-medium capitalize transition-colors",
              tab === t ? "bg-bg-elev text-fg shadow-sm ring-1 ring-border/50" : "text-fg-muted hover:text-fg",
            )}
          >
            {t}
            <span className="ml-1.5 text-[11px] text-fg-subtle">{tabCount(t)}</span>
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
            <>
              <Panel className="divide-y divide-border/40 overflow-hidden p-0">
                {(showAllPeople ? shown : shown.slice(0, PEOPLE_CAP)).map((p) => (
                  <PersonRow key={p.id} p={p} canOpenProfile={canOpenProfiles} />
                ))}
              </Panel>
              {!showAllPeople && shown.length > PEOPLE_CAP && (
                <button
                  type="button"
                  onClick={() => setShowAllPeople(true)}
                  className="w-full rounded-xl bg-bg-elev px-3.5 py-2.5 text-center text-sm font-medium text-accent ring-1 ring-border transition-colors hover:bg-bg-subtle/60"
                >
                  Show all ({shown.length})
                </button>
              )}
            </>
          )}
        </div>
      ) : tab === "companies" ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {companies.length === 0 ? (
            <Panel className="p-6 text-center text-sm text-fg-muted sm:col-span-2">No companies.</Panel>
          ) : (
            companies.map((c) => <CompanyCard key={c.id} c={c} />)
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3.5 py-2.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
            <Search size={16} className="shrink-0 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, company or status…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg">
                <X size={13} />
              </button>
            )}
          </div>

          {showCompanyFilter && (
            <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
              <FilterChip active={companyId === "all"} onClick={() => setCompanyId("all")}>All</FilterChip>
              {companies.map((c) => (
                <FilterChip key={c.id} active={companyId === c.id} onClick={() => setCompanyId(c.id)}>{c.name}</FilterChip>
              ))}
            </div>
          )}

          {shownAttendance.length === 0 ? (
            <Panel className="p-6 text-center text-sm text-fg-muted">No one to show.</Panel>
          ) : (
            <Panel className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                <span className="text-sm font-semibold">{presentCount} in · {shownAttendance.length - markedCount} not marked</span>
                <span className="text-[11px] text-fg-subtle">{markedCount}/{shownAttendance.length} recorded today</span>
              </div>
              <ul className="divide-y divide-border/40">
                {shownAttendance.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{initials(a.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      {a.company && <p className="truncate text-[11px] text-fg-subtle">{a.company}</p>}
                    </div>
                    {a.status ? (
                      <Badge tone={ATTENDANCE_TONE[a.status as keyof typeof ATTENDANCE_TONE] ?? "default"}>{a.status}</Badge>
                    ) : (
                      <span className="text-[11px] text-fg-subtle">Not marked</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
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
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors",
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
    <Link href={`/portal/companies/${c.id}?from=directory`} className="group block">
      <Panel className="flex items-center gap-3 p-3.5 transition-shadow group-hover:ring-2 group-hover:ring-accent/30">
        <CompanyAvatar name={c.name} logoUrl={c.logoUrl} size={40} rounded="rounded-full" iconSize={18} />
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
