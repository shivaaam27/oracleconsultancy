import { getAllTasks, computeCompanyKpis } from "@/lib/queries";
import { Hero, TONE } from "@/components/surface-kit";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { CompanyAvatar } from "@/components/company-avatar";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { getDepartmentsAdmin } from "@/lib/departments";
import { CompaniesHubTabs } from "@/components/companies-hub-tabs";
import { AlertOctagon, CheckCircle2, Clock, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

function riskTint(score: number): { label: string; cls: string } {
  if (score > 50) return { label: "High risk", cls: "bg-danger-soft/70 ring-1 ring-danger/30 text-danger" };
  if (score > 20) return { label: "Watch", cls: "bg-warn-soft/70 ring-1 ring-warn/30 text-warn" };
  return { label: "Healthy", cls: "bg-success-soft/70 ring-1 ring-success/30 text-success" };
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [rows, logoMap, departments] = await Promise.all([getAllTasks(), getCompanyLogoMap(), getDepartmentsAdmin()]);
  const companies = computeCompanyKpis(rows);
  const totals = companies.reduce(
    (a, c) => ({ open: a.open + c.open, overdue: a.overdue + c.overdue, completed: a.completed + c.completed }),
    { open: 0, overdue: 0, completed: 0 }
  );
  return (
    <div className="space-y-5">
      <HrmsCrumbs from={from} />
      <Hero title="Companies" subtitle={`${companies.length} companies tracked across the portfolio`}>
        <div className="flex flex-wrap gap-5">
          {([
            { label: "Open tasks", value: totals.open, tone: "accent" as const },
            { label: "Overdue", value: totals.overdue, tone: totals.overdue ? ("danger" as const) : ("muted" as const) },
            { label: "Completed", value: totals.completed, tone: "success" as const },
          ]).map((m) => (
            <div key={m.label} className="flex items-baseline gap-1.5">
              <span className={`text-xl font-semibold tabular ${TONE[m.tone].text}`}>{m.value}</span>
              <span className="text-[11px] text-fg-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </Hero>

      <CompaniesHubTabs
        departments={departments}
        companiesSlot={
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {companies.map((c) => {
          const accent = c.accent || "hsl(var(--accent))";
          const risk = riskTint(c.riskScore);
          return (
            <CompanyDrawerLink key={c.id} id={c.id} className="group block w-full text-left">
              <div className="bg-bg-elev ring-1 ring-border elevated relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                {/* accent wash keyed to the company colour */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full blur-2xl opacity-50"
                  style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
                />
                <div className="relative flex items-start justify-between gap-2">
                  <CompanyAvatar name={c.name} accent={accent} logoUrl={logoMap.get(c.id)} size={40} rounded="rounded-xl" iconSize={17} />
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-md ${risk.cls}`}>
                    {risk.label}
                    <span className="tabular opacity-70">{c.riskScore}</span>
                  </span>
                </div>

                <div className="relative mt-3 flex items-center gap-1">
                  <div className="min-w-0">
                    <div className="font-semibold tracking-tight truncate group-hover:text-accent transition-colors">{c.name}</div>
                    <div className="text-xs text-fg-muted mt-0.5">{c.total} total tasks</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>

                {/* Mini stat strip */}
                <div className="relative grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-border/60 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><Clock size={11} /> Open</span>
                    <span className="font-semibold tabular text-sm">{c.open}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><AlertOctagon size={11} /> Overdue</span>
                    <span className={`font-semibold tabular text-sm ${c.overdue ? "text-danger" : ""}`}>{c.overdue}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-fg-subtle inline-flex items-center gap-1"><CheckCircle2 size={11} /> Done</span>
                    <span className="font-semibold tabular text-sm">{c.completed}</span>
                  </div>
                </div>
              </div>
            </CompanyDrawerLink>
          );
        })}
      </div>
        }
      />
    </div>
  );
}
