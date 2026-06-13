"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Building2, ShieldCheck, Clock, Users, FileText, FileWarning, ExternalLink, ChevronRight } from "lucide-react";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { SectionCard, EmptyState, ProgressTrack } from "./drawer-kit";
import { Badge, LinkButton } from "./ui";
import { PersonDrawerLink } from "./person-drawer-link";
import { TaskDrawerLink } from "./task-drawer-link";
import { cn } from "@/lib/cn";

type Detail = {
  company: { id: number; name: string; accent: string | null; logoUrl: string | null; legalName: string | null; registrationNo: string | null; tin: string | null; vrn: string | null; address: string | null; phone: string | null; email: string | null };
  compliance: { score: number; status: "Good" | "Watch" | "Risk"; missing: number; expired: number; expiring: number } | null;
  tasks: { open: number; overdue: number; total: number; top: Array<{ code: string; actionItem: string; deadline: string | null; status: string; priority: string }> };
  documents: { count: number; attention: Array<{ id: number; title: string; status: "Expired" | "Expiring"; expiryLabel: string | null }> };
  teamCount: number;
  team: Array<{ id: number; name: string; role: string | null }>;
};

const bandTone = { Good: "success", Watch: "warn", Risk: "danger" } as const;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function CompanyDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const idStr = searchParams.get("company");
  // Don't open the drawer on the company's own page.
  const onCompanyPage = /^\/companies\/\d+/.test(pathname);
  const open = !!idStr && !onCompanyPage;

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState("overview");

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("company");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!idStr || onCompanyPage) { setData(null); return; }
    setLoading(true); setError(false); setTab("overview");
    fetch(`/api/company-detail?id=${encodeURIComponent(idStr)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d: Detail) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [idStr, onCompanyPage]);

  const c = data?.company;
  const comp = data?.compliance;
  const tone: "accent" | "success" | "warn" | "danger" = !comp ? "accent" : comp.status === "Risk" ? "danger" : comp.status === "Watch" ? "warn" : "success";
  const accent = c?.accent || "hsl(var(--accent))";
  const base = c ? `/companies/${c.id}` : "#";

  const heroNode = c ? (
    <div className="flex items-start gap-3.5 pr-8">
      {c.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt={c.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-border/60 bg-bg-elev" />
      ) : (
        <span className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-2xl text-white text-sm font-semibold shadow-sm" style={{ backgroundColor: accent }}>
          {initials(c.name)}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-lg font-semibold leading-tight truncate">{c.name}</h2>
        {(c.legalName || c.registrationNo) && (
          <div className="text-xs text-fg-muted truncate">{[c.legalName, c.registrationNo && `Reg ${c.registrationNo}`].filter(Boolean).join(" · ")}</div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {comp && <Badge tone={bandTone[comp.status]}>{comp.score}% compliant</Badge>}
          {data && data.tasks.overdue > 0 && <Badge tone="danger">{data.tasks.overdue} overdue</Badge>}
        </div>
      </div>
    </div>
  ) : <div className="h-12" />;

  const overview = data && c ? (
    <>
      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Compliance", value: comp ? `${comp.score}%` : "—", tone: !comp ? "text-fg-subtle" : comp.status === "Risk" ? "text-danger" : comp.status === "Watch" ? "text-warn" : "text-success", href: `${base}?tab=profile` },
          { label: "Open", value: data.tasks.open, tone: data.tasks.overdue ? "text-danger" : data.tasks.open ? "text-info" : "text-fg-subtle", href: `${base}?tab=tasks` },
          { label: "Docs", value: data.documents.count, tone: "text-info", href: `${base}?tab=profile` },
          { label: "Team", value: data.teamCount, tone: "text-info", href: `${base}?tab=org` },
        ].map((t) => (
          <Link key={t.label} href={t.href} onClick={close} className="rounded-xl bg-bg-elev ring-1 ring-border/70 px-2 py-2.5 text-center hover:ring-accent/30 transition-all">
            <div className={cn("text-lg font-semibold tabular leading-none", t.tone)}>{t.value}</div>
            <div className="mt-1 text-[10px] text-fg-muted leading-tight">{t.label}</div>
          </Link>
        ))}
      </div>

      {/* Compliance card */}
      {comp && (
        <Link href={`${base}?tab=profile`} onClick={close} className="block">
          <SectionCard className="p-3.5 space-y-2.5 hover:ring-1 hover:ring-accent/30 transition-all">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-accent" />
              <span className="text-sm font-semibold">Compliance</span>
              <Badge tone={bandTone[comp.status]}>{comp.status}</Badge>
              <span className={cn("ml-auto text-lg font-semibold tabular", comp.status === "Good" ? "text-success" : comp.status === "Watch" ? "text-warn" : "text-danger")}>{comp.score}%</span>
            </div>
            <ProgressTrack value={comp.score} total={100} tone={bandTone[comp.status]} />
            <div className="text-[11px] text-fg-muted">{comp.missing} missing · {comp.expired} expired · {comp.expiring} expiring</div>
          </SectionCard>
        </Link>
      )}

      {/* Documents needing attention */}
      {data.documents.attention.length > 0 && (
        <SectionCard>
          <div className="px-4 py-2.5 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5"><FileWarning size={12} /> Documents needing attention</div>
          <ul className="divide-y divide-border/50">
            {data.documents.attention.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.title}</span>
                  {d.expiryLabel && <span className="block truncate text-[11px] text-fg-subtle">{d.expiryLabel}</span>}
                </span>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${d.status === "Expired" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{d.status}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Open tasks preview */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
          <Clock size={12} /> Open tasks
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.tasks.open}</span>
          <Link href={`${base}?tab=tasks`} onClick={close} className="ml-auto inline-flex items-center gap-1 text-[11px] normal-case tracking-normal font-normal text-fg-muted hover:text-accent"><ExternalLink size={11} /> All</Link>
        </div>
        {data.tasks.top.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} tone="success" title="No open tasks" hint="Everything here is done." />
        ) : (
          <ul className="divide-y divide-border/50">
            {data.tasks.top.map((t) => (
              <li key={t.code}>
                <TaskDrawerLink code={t.code} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-bg-muted/50 transition-colors">
                  <span className="text-[11px] font-mono text-fg-subtle shrink-0">{t.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.actionItem}</span>
                  <ChevronRight size={14} className="text-fg-subtle shrink-0" />
                </TaskDrawerLink>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  ) : null;

  const connections = data && c ? (
    <>
      {/* People — one-hop neighbours, each with its own hover preview + drawer */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
          <Users size={12} /> People
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.teamCount}</span>
        </div>
        {data.team.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No team yet" hint="No active people linked to this company." />
        ) : (
          <ul className="divide-y divide-border/50">
            {data.team.map((p) => (
              <li key={p.id}>
                <PersonDrawerLink id={p.id} name={p.name} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-bg-muted/50 transition-colors">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    {p.role && <span className="block truncate text-[11px] text-fg-subtle">{p.role}</span>}
                  </span>
                  <ChevronRight size={14} className="text-fg-subtle shrink-0" />
                </PersonDrawerLink>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Open tasks — jump straight to the task drawer (with hover preview) */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
          <Clock size={12} /> Open tasks
          <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.tasks.open}</span>
        </div>
        {data.tasks.top.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} tone="success" title="No open tasks" hint="Everything here is done." />
        ) : (
          <ul className="divide-y divide-border/50">
            {data.tasks.top.map((t) => (
              <li key={t.code}>
                <TaskDrawerLink code={t.code} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-bg-muted/50 transition-colors">
                  <span className="text-[11px] font-mono text-fg-subtle shrink-0">{t.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.actionItem}</span>
                  <ChevronRight size={14} className="text-fg-subtle shrink-0" />
                </TaskDrawerLink>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  ) : null;

  const tabs: DrawerTab[] = c
    ? [
        { id: "overview", label: "Overview", content: overview },
        { id: "connections", label: "Connections", content: connections },
      ]
    : [];

  const actionBar = c ? (
    <div className="flex items-center gap-2">
      <LinkButton href={base} onClick={close} size="sm">
        <Building2 size={13} /> Open full page
      </LinkButton>
      <div className="ml-auto flex items-center gap-1.5">
        <Link href={`${base}?tab=profile`} onClick={close} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors"><FileText size={13} /> Files</Link>
        <Link href={`${base}?tab=org`} onClick={close} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors"><Users size={13} /> Team</Link>
      </div>
    </div>
  ) : undefined;

  return (
    <EntityDrawer
      open={open}
      onClose={close}
      title={c?.name ?? "Company"}
      tone={tone}
      loading={loading && !data}
      error={error}
      errorLabel="Couldn't load company."
      maxWidth="560px"
      hero={heroNode}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      actionBar={actionBar}
    />
  );
}
