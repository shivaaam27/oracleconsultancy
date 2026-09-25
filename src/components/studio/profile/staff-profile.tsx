"use client";

/**
 * A member of STAFF's own Profile, in Studio (26 Sept 2026, mockup S_Profile).
 * The page lays out what the server hands it; every part that saves anything
 * (contact details, a document, passkeys, password, alerts) is the portal's
 * existing component, unchanged.
 *
 *   dark band · face · name · role · staff ID · access · tabs
 *   Overview: How I did + attendance + guides │ My details │ files · equipment · sign-in
 *
 * The tab is in the address (?tab=), so Back and a shared link land on it.
 */
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StudioScope } from "@/components/studio/kit";
import { PersonFace } from "@/components/studio/face";
import { cn } from "@/lib/cn";

export type ProfileTab = "overview" | "details" | "files" | "attendance" | "equipment" | "signin";
const TABS: { id: ProfileTab; label: string; short?: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "My details" },
  { id: "files", label: "My files", short: "Files" },
  { id: "attendance", label: "Attendance" },
  { id: "equipment", label: "Equipment" },
  { id: "signin", label: "Sign-in & app", short: "Sign-in" },
];

export function StaffProfile({ name, sub, pills, sections }: {
  name: string;
  sub: string;
  pills: { label: string; dot?: string }[];
  sections: { kpi: React.ReactNode; attendance: React.ReactNode; guides: React.ReactNode; details: React.ReactNode; files: React.ReactNode; equipment: React.ReactNode; signin: React.ReactNode; signout: React.ReactNode };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab") as ProfileTab | null;
  const tab: ProfileTab = TABS.some((t) => t.id === raw) ? raw! : "overview";
  const go = (t: ProfileTab) => {
    const p = new URLSearchParams(params.toString());
    if (t === "overview") p.delete("tab"); else p.set("tab", t);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const one: Record<Exclude<ProfileTab, "overview">, React.ReactNode> = {
    details: sections.details,
    files: sections.files,
    attendance: sections.attendance,
    equipment: sections.equipment,
    signin: sections.signin,
  };

  return (
    <StudioScope className="space-y-4">
      <div className="st-tex-rings rounded-[20px] bg-[var(--st-card)] px-5 pt-4 text-[var(--st-on-card)] sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <PersonFace name={name} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[22px] font-medium leading-tight tracking-[-0.025em] sm:text-[30px]">{name}</h1>
            <div className="mt-1 truncate text-xs text-[#F2F2F0] sm:text-[13px]">{sub}</div>
          </div>
          <div className="flex basis-full flex-wrap gap-1.5 sm:basis-auto">
            {pills.map((p) => (
              <span key={p.label} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0]">
                {p.dot && <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.dot }} />}{p.label}
              </span>
            ))}
          </div>
        </div>
        <div className="-mx-1 mt-3 flex gap-5 overflow-x-auto px-1 [scrollbar-width:none] sm:mt-4" role="tablist" aria-label="Profile">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}
              className={cn("-mb-px h-10 shrink-0 border-b-2 text-[13px] transition-colors", tab === t.id ? "border-white text-white" : "border-transparent text-[#C9CBCF] hover:text-white")}>
              {t.short ? <><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></> : t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            {sections.kpi}
            {sections.attendance}
            {sections.guides}
          </div>
          <div className="min-w-0">{sections.details}</div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 xl:col-span-1">
            {sections.files}
            {sections.equipment}
            {sections.signin}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">{one[tab]}</div>
      )}
      <div className="mx-auto w-full max-w-[720px]">{sections.signout}</div>
    </StudioScope>
  );
}

/** A white Studio card with a head. */
export function PCard({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[18px] bg-[var(--st-surface)] p-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        {right && <span className="text-xs text-[var(--st-muted)]">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** How I did — the month's completed tasks (stepping back three months), with
 *  what is open and late now. The figures are the portal's own KPI. */
export function KpiCard({ months, openNow, lateNow }: { months: { monthLabel: string; completed: number }[]; openNow: number; lateNow: number }) {
  const [i, setI] = useState(0);
  const k = months[i];
  if (!k) return null;
  const arrow = "flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-[var(--st-card-line)] text-[#C9CBCF] hover:bg-[var(--st-card-2)] disabled:opacity-40";
  return (
    <section id="kpi" className="st-tex-rings scroll-mt-4 rounded-[18px] bg-[var(--st-card)] px-5 py-4 text-[var(--st-on-card)] sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-2 text-[13px] text-[#C9CBCF]">
        <span>How I did · {k.monthLabel}</span>
        <span className="flex gap-1">
          <button type="button" aria-label="Earlier month" disabled={i >= months.length - 1} onClick={() => setI((n) => n + 1)} className={arrow}><ChevronLeft size={12} /></button>
          <button type="button" aria-label="Later month" disabled={i === 0} onClick={() => setI((n) => n - 1)} className={arrow}><ChevronRight size={12} /></button>
        </span>
      </div>
      <div className="mt-4 flex gap-6 sm:gap-8">
        <div><div className="text-[34px] leading-none tracking-[-0.04em] tabular-nums text-[#5BE0A5] sm:text-[44px]">{k.completed}</div><div className="mt-1 text-xs">completed</div></div>
        <div><div className="text-[34px] leading-none tracking-[-0.04em] tabular-nums sm:text-[44px]">{openNow}</div><div className="mt-1 text-xs">open now</div></div>
        <div><div className={cn("text-[34px] leading-none tracking-[-0.04em] tabular-nums sm:text-[44px]", lateNow > 0 && "text-[#F07BBE]")}>{lateNow}</div><div className="mt-1 text-xs">late</div></div>
      </div>
    </section>
  );
}
