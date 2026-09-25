"use client";

/**
 * People for a member of STAFF, in Studio (26 Sept 2026, mockup S_Rules:
 * "Directory → People, view-only: their colleagues, call / WhatsApp / email").
 * The same contact book the old Directory was — the people who share one of
 * their companies, plus the Administrator — and nothing more: no workload, no
 * profiles, no private details. Chat opens the portal's own chat.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, MessagesSquare, Phone, Search } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, stFloatBar } from "@/components/studio/kit";
import { PersonFace } from "@/components/studio/face";
import { cn } from "@/lib/cn";

export type StaffPerson = { id: number; name: string; role: string | null; company: string | null; companyIds: number[]; callHref: string | null; waHref: string | null; mailtoHref: string | null; me: boolean; help: boolean };
export type StaffCompany = { id: number; name: string; headcount: number };

const ICON = "flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--st-line)] text-[var(--st-sub)] transition-colors hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]";

export function StaffPeople({ people, companies }: { people: StaffPerson[]; companies: StaffCompany[] }) {
  const [q, setQ] = useState("");
  const [co, setCo] = useState<number | null>(null);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people
      .filter((p) => (co == null || p.companyIds.includes(co)) && (!n || [p.name, p.role, p.company].some((v) => v?.toLowerCase().includes(n))))
      .sort((a, b) => Number(b.help) - Number(a.help) || Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
  }, [people, q, co]);
  const help = people.find((p) => p.help) ?? null;
  const colleagues = people.filter((p) => !p.me && !p.help).length;
  const max = Math.max(1, ...companies.map((c) => c.headcount));

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader title="People" />
      <StudioCardRow>
        <StudioCard className="min-h-[180px]">
          <CardHead label="Your colleagues" right={<span>{companies.length} {companies.length === 1 ? "company" : "companies"}</span>} />
          <div className="mt-auto flex flex-col gap-3 pt-3">
            <BigNumber value={colleagues} unit={colleagues === 1 ? "person to reach" : "people to reach"} />
            <div className="flex flex-col gap-1.5">
              {companies.slice(0, 4).map((c) => (
                <button key={c.id} type="button" onClick={() => setCo(co === c.id ? null : c.id)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-left text-xs">
                  <span className={cn("truncate", co === c.id ? "text-white" : "text-[#C9CBCF]")}>{c.name}</span>
                  <span className="st-mono text-[var(--st-on-card-muted)]">{c.headcount}</span>
                  <span className="col-span-2 mt-1 h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-card-line)]"><span className="block h-full rounded-[3px] bg-[var(--st-ok)]" style={{ width: `${(c.headcount / max) * 100}%` }} /></span>
                </button>
              ))}
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[180px]">
          <CardHead label="Need a hand?" right={<span>help, feedback, a problem</span>} />
          {help ? (
            <div className="mt-auto flex flex-col gap-3 pt-3">
              <div className="flex items-center gap-3">
                <PersonFace name={help.name} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-[17px]">{help.name}</div>
                  <div className="text-xs text-[var(--st-on-card-muted)]">Always there for everyone</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/portal/chat?dm=${help.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--st-on-card)] px-3 text-xs font-semibold text-[#111214]"><MessagesSquare size={13} />Message</Link>
                {help.mailtoHref && <a href={help.mailtoHref} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#34363B] px-3 text-xs"><Mail size={13} />Email</a>}
                {help.callHref && <a href={help.callHref} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#34363B] px-3 text-xs"><Phone size={13} />Call</a>}
              </div>
            </div>
          ) : <p className="mt-auto pt-3 text-[13px] text-[var(--st-on-card-muted)]">Ask your manager.</p>}
        </StudioCard>
      </StudioCardRow>

      <div className="overflow-hidden rounded-[20px] bg-[var(--st-surface)]">
        {rows.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-[var(--st-muted)]">Nobody matches that.</p>}
        {rows.map((p) => (
          <div key={p.id} className="flex items-center gap-3 border-b border-[var(--st-line-soft)] px-4 py-3 last:border-0 sm:px-5">
            <PersonFace name={p.name} label={p.me ? "You" : undefined} size={36} peek />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.me ? `${p.name} (you)` : p.name}</div>
              <div className="truncate text-xs text-[var(--st-muted)]">{[p.role, p.company].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            {!p.me && (
              <div className="flex shrink-0 gap-1.5">
                <Link href={`/portal/chat?dm=${p.id}`} aria-label={`Message ${p.name}`} title="Message" className={ICON}><MessagesSquare size={15} /></Link>
                {p.waHref && <a href={p.waHref} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className={cn(ICON, "max-sm:hidden")}><MessageCircle size={15} /></a>}
                {p.mailtoHref && <a href={p.mailtoHref} aria-label="Email" title="Email" className={cn(ICON, "max-sm:hidden")}><Mail size={15} /></a>}
                {p.callHref && <a href={p.callHref} aria-label="Call" title="Call" className={ICON}><Phone size={15} /></a>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div data-sticky-foot className={cn(stFloatBar.sticky, "mt-1")}>
        <div className="pointer-events-auto flex w-full max-w-[860px] flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:flex-nowrap sm:py-0">
          <label className="flex min-w-[180px] flex-1 items-center gap-2 text-[var(--st-muted)]">
            <Search size={15} />
            <span className="sr-only">Search people</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — a name, a role or a company"
              className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
          </label>
          {companies.length > 1 && (
            <div className="flex w-full min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:w-auto">
              {[{ id: null as number | null, name: "Everyone" }, ...companies].map((c) => (
                <button key={c.id ?? "all"} type="button" aria-pressed={co === c.id} onClick={() => setCo(c.id)}
                  className={cn("inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-[10px] border px-3 text-xs transition-colors",
                    co === c.id ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]")}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioScope>
  );
}
