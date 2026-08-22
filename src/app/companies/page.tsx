import { getAllTasks, computeCompanyKpisByMembership, computeGlobalKpis } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { sb } from "@/db/supabase";
import { TONE } from "@/components/surface-kit";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { CompanyAvatar } from "@/components/company-avatar";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { getDepartmentsAdmin } from "@/lib/departments";
import { getSitesAdmin } from "@/lib/sites";
import { getRolesAdmin } from "@/lib/roles";
import { CompaniesHubTabs } from "@/components/companies-hub-tabs";
import { AddCompanyCard } from "@/components/add-company-card";
import { AlertOctagon, CheckCircle2, Clock, ChevronRight, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function riskTint(score: number): { label: string; cls: string; dot: string; text: string } {
  if (score > 50) return { label: "High risk", cls: "bg-danger-soft/70 ring-1 ring-danger/30 text-danger", dot: "bg-danger", text: "text-danger" };
  if (score > 20) return { label: "Watch", cls: "bg-warn-soft/70 ring-1 ring-warn/30 text-warn", dot: "bg-warn", text: "text-warn" };
  return { label: "Healthy", cls: "bg-success-soft/70 ring-1 ring-success/30 text-success", dot: "bg-success", text: "text-success" };
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [rows, logoMap, departments, sites, roles, allCompanies, personCompanies] = await Promise.all([
    getAllTasks(), getCompanyLogoMap(), getDepartmentsAdmin(), getSitesAdmin(), getRolesAdmin(),
    sb.from("companies").select("id,name,accent_color").eq("active", true).order("name"),
    getPersonCompaniesMap(),
  ]);
  // Count each task toward every company it touches (its own + its people's
  // companies), and include every active company so a task-less one still shows.
  const companyList = (allCompanies.data ?? []).map((c) => ({
    id: c.id as number, name: c.name as string, accent: (c.accent_color as string | null) ?? null,
  }));
  const companies = computeCompanyKpisByMembership(rows, companyList, personCompanies);
  // Active staff per company = anyone whose primary company OR an extra link
  // points at it (same membership the task roll-up uses).
  const staffByCompany = new Map<number, number>();
  for (const cids of personCompanies.values()) {
    for (const cid of cids) staffByCompany.set(cid, (staffByCompany.get(cid) ?? 0) + 1);
  }
  // Portfolio totals are DISTINCT (a shared task counts once) — never the sum of
  // the per-company cards, which double-count multi-company work.
  const g = computeGlobalKpis(rows);
  const totals = { open: g.open, overdue: g.overdue, completed: g.completed };
  return (
    <div className="space-y-5">
      <HrmsCrumbs from={from} />
      <PageHeader title="Companies" sub={`${companies.length} companies tracked across the portfolio`}>
        <div className="flex flex-wrap gap-5">
          {([
            { label: "Open tasks", value: totals.open, tone: "accent" as const },
            { label: "Overdue", value: totals.overdue, tone: totals.overdue ? ("danger" as const) : ("muted" as const) },
            { label: "Completed", value: totals.completed, tone: "success" as const },
          ]).map((m) => (
            <div key={m.label} className="flex items-baseline gap-1.5">
              <span className={`text-xl font-semibold tabular ${TONE[m.tone].text}`}>{m.value}</span>
              <span className="text-xs text-fg-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </PageHeader>

      <CompaniesHubTabs
        departments={departments}
        sites={sites}
        roles={roles}
        companiesSlot={
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {companies.map((c) => {
          const accent = c.accent || "hsl(var(--accent))";
          const risk = riskTint(c.riskScore);
          return (
            <CompanyDrawerLink key={c.id} id={c.id} className="group block w-full text-left">
              <div className="bg-bg-elev ring-1 ring-border elevated relative overflow-hidden rounded-2xl p-3 sm:p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                {/* accent wash keyed to the company colour */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full blur-2xl opacity-50"
                  style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
                />
                {/* Phone: the mark and the name on one line, risk and the total on
                    the next — as a DOT and a word, which is Desk's rule for status
                    and a third the width of the pill. Two bands become one, and a
                    card 184px tall becomes ~110px: thirteen of them is 2,400px of
                    scrolling otherwise. The desktop keeps its own head below,
                    untouched. */}
                <div className="relative flex items-center gap-2.5 sm:hidden">
                  <CompanyAvatar name={c.name} accent={accent} logoUrl={logoMap.get(c.id)} size={34} rounded="rounded-lg" iconSize={15} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold tracking-tight">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${risk.dot}`} />
                      <span className={risk.text}>{risk.label} {c.riskScore}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{c.total} tasks</span>
                    </div>
                  </div>
                </div>

                <div className="relative hidden items-start justify-between gap-2 sm:flex">
                  <CompanyAvatar name={c.name} accent={accent} logoUrl={logoMap.get(c.id)} size={40} rounded="rounded-xl" iconSize={17} />
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md ${risk.cls}`}>
                    {risk.label}
                    <span className="tabular opacity-70">{c.riskScore}</span>
                  </span>
                </div>

                <div className="relative mt-3 hidden items-center gap-1 sm:flex">
                  <div className="min-w-0">
                    <div className="font-semibold tracking-tight truncate group-hover:text-accent transition-colors">{c.name}</div>
                    <div className="text-xs text-fg-muted mt-0.5">{c.total} total tasks</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>

                {/* Mini stat strip */}
                <div className="relative grid grid-cols-4 gap-2 mt-2.5 pt-2.5 sm:mt-3.5 sm:pt-3.5 border-t border-border/60 text-xs">
                  <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-stretch sm:gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><Users size={11} /> Staff</span>
                    <span className="font-semibold tabular text-base sm:text-sm">{staffByCompany.get(c.id) ?? 0}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-stretch sm:gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><Clock size={11} /> Open</span>
                    <span className="font-semibold tabular text-base sm:text-sm">{c.open}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-stretch sm:gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><AlertOctagon size={11} /> Overdue</span>
                    <span className={`font-semibold tabular text-base sm:text-sm ${c.overdue ? "text-danger" : ""}`}>{c.overdue}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-stretch sm:gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><CheckCircle2 size={11} /> Done</span>
                    <span className="font-semibold tabular text-base sm:text-sm">{c.completed}</span>
                  </div>
                </div>
              </div>
            </CompanyDrawerLink>
          );
        })}
        <AddCompanyCard />
      </div>
        }
      />
    </div>
  );
}
