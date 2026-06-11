import { getAllTasks, statusBreakdown, priorityBreakdown, type TaskRow } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { sb } from "@/db/supabase";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { gatherInsightForecast } from "@/lib/forecast";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/arc-gauge";
import { CalendarClock, FileWarning, RefreshCw, UserCheck } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "danger" | "warn" | "success" | "info" }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const bg = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : tone === "success" ? "bg-success" : tone === "info" ? "bg-info" : "bg-accent";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
        <div className={`${bg} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-fg-muted w-8 text-right tabular">{value}</div>
    </div>
  );
}

function statusTone(s: string): "accent" | "danger" | "warn" | "success" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "accent";
}

export default async function InsightsPage() {
  const rows = await getAllTasks();
  const isOpenRow = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";

  const statuses = statusBreakdown(rows);
  const priorities = priorityBreakdown(rows);
  const maxStatus = Math.max(...statuses.map((s) => s.count), 1);
  const maxPrio = Math.max(...priorities.map((p) => p.count), 1);

  const companyAgg = new Map<number, { name: string; open: number; overdue: number }>();
  for (const r of rows) {
    if (!isOpenRow(r)) continue;
    const cur = companyAgg.get(r.companyId) ?? { name: r.companyName, open: 0, overdue: 0 };
    cur.open += 1;
    if (r.flag === "overdue" || r.flag === "escalate-now") cur.overdue += 1;
    companyAgg.set(r.companyId, cur);
  }
  const companyRows = [...companyAgg.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.open - a.open);
  const maxCompanyOpen = Math.max(...companyRows.map((c) => c.open), 1);

  // Compliance health: per-company document status roll-up.
  const [documents, { data: compRows }] = await Promise.all([
    listDocuments(),
    sb.from("companies").select("id,name"),
  ]);
  const compNameById = new Map<number, string>((compRows ?? []).map((c) => [c.id as number, c.name as string]));
  type DocAgg = { id: number; name: string; total: number; valid: number; expiring: number; expired: number };
  const docAgg = new Map<number, DocAgg>();
  let unassignedDocs = 0;
  for (const d of documents) {
    if (!d.companyId) { unassignedDocs += 1; continue; }
    const cur = docAgg.get(d.companyId) ?? { id: d.companyId, name: compNameById.get(d.companyId) ?? "—", total: 0, valid: 0, expiring: 0, expired: 0 };
    cur.total += 1;
    const s = deriveDocStatus(d);
    if (s === "Expired") cur.expired += 1;
    else if (s === "Expiring") cur.expiring += 1;
    else cur.valid += 1;
    docAgg.set(d.companyId, cur);
  }
  const docCompanyRows = [...docAgg.values()].sort((a, b) => (b.expired - a.expired) || (b.expiring - a.expiring) || b.total - a.total);
  const totalDocs = documents.length;

  // Forward-looking signals: leave liability, compliance decay, renewals, probation.
  const forecast = await gatherInsightForecast(documents, compNameById);
  const fc = forecast;

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
  const dueChip = (daysLeft: number) =>
    daysLeft < 0 ? { label: `${Math.abs(daysLeft)}d ago`, tone: "danger" as const }
      : daysLeft === 0 ? { label: "today", tone: "danger" as const }
        : daysLeft <= 7 ? { label: `${daysLeft}d`, tone: "warn" as const }
          : { label: `${daysLeft}d`, tone: "info" as const };
  const chipCls: Record<"danger" | "warn" | "info", string> = {
    danger: "bg-danger-soft/60 text-danger ring-danger/25",
    warn: "bg-warn-soft/60 text-warn ring-warn/25",
    info: "bg-info-soft/60 text-info ring-info/25",
  };
  const hasForecast =
    fc.leaveLiability !== null || fc.complianceDecay.items.length > 0 || fc.renewals.length > 0 || fc.probation.length > 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader title="Insights" sub="What's coming, plus portfolio distribution across companies, status, and priority." />

      {hasForecast && (
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">Looking ahead</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Annual-leave liability */}
            {fc.leaveLiability && (
              <Reveal delay={0} className="glass elevated rounded-2xl p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                  <CalendarClock size={13} className="text-info" /> {fc.leaveLiability.typeName} liability
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <CountUp value={fc.leaveLiability.outstanding} className="text-2xl font-semibold tabular" />
                  <span className="text-sm text-fg-muted">days still owed</span>
                </div>
                <p className="mt-1 text-xs text-fg-subtle leading-relaxed">
                  {fc.leaveLiability.staffCount} staff × {fc.leaveLiability.entitlement} days
                  = {fc.leaveLiability.totalEntitled} entitled, {fc.leaveLiability.taken} taken this cycle.
                </p>
                <Link href="/hrms/leave" className="mt-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent">View leave →</Link>
              </Reveal>
            )}

            {/* Compliance decay */}
            <Reveal delay={0.05} className="glass elevated rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                <FileWarning size={13} className="text-warn" /> Compliance decay
              </div>
              {fc.complianceDecay.items.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">No documents expire in the next {fc.complianceDecay.horizonDays} days. 🎉</p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-fg-subtle">
                    {fc.complianceDecay.items.length} document{fc.complianceDecay.items.length === 1 ? "" : "s"} expire within {fc.complianceDecay.horizonDays} days — score will drop unless renewed.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {fc.complianceDecay.items.slice(0, 5).map((d) => {
                      const c = dueChip(d.daysLeft);
                      return (
                        <li key={d.documentId} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{d.title}{d.companyName ? <span className="text-fg-subtle"> · {d.companyName}</span> : null}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ring-1 ${chipCls[c.tone]}`}>{c.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {fc.complianceDecay.items.length > 5 && (
                    <Link href="/documents" className="mt-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent">+{fc.complianceDecay.items.length - 5} more →</Link>
                  )}
                </>
              )}
            </Reveal>

            {/* Renewals radar */}
            {fc.renewals.length > 0 && (
              <Reveal delay={0.1} className="glass elevated rounded-2xl p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                  <RefreshCw size={13} className="text-info" /> Renewals radar
                </div>
                <ul className="mt-2 space-y-1.5">
                  {fc.renewals.slice(0, 5).map((r) => {
                    const c = dueChip(r.daysLeft);
                    return (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{r.label}<span className="text-fg-subtle"> · {fmtDate(r.dueDate)}</span></span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ring-1 ${chipCls[c.tone]}`}>{c.label}</span>
                      </li>
                    );
                  })}
                </ul>
                {fc.renewals.length > 5 && (
                  <p className="mt-2 text-xs text-fg-subtle">+{fc.renewals.length - 5} more upcoming</p>
                )}
              </Reveal>
            )}

            {/* Probation / notice deadlines */}
            {fc.probation.length > 0 && (
              <Reveal delay={0.15} className="glass elevated rounded-2xl p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                  <UserCheck size={13} className="text-accent" /> Probation reviews due
                </div>
                <ul className="mt-2 space-y-1.5">
                  {fc.probation.slice(0, 5).map((p) => {
                    const c = dueChip(p.daysLeft);
                    return (
                      <li key={p.personId} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.name}<span className="text-fg-subtle"> · {fmtDate(p.date)}</span></span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ring-1 ${chipCls[c.tone]}`}>{c.label}</span>
                      </li>
                    );
                  })}
                </ul>
                {fc.probation.length > 5 && (
                  <Link href="/people" className="mt-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent">+{fc.probation.length - 5} more →</Link>
                )}
              </Reveal>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">Open by company</p>
        <div className="glass elevated rounded-2xl p-4 space-y-2.5">
          {companyRows.length === 0 ? (
            <p className="text-sm text-fg-muted py-2">No open tasks. 🎉</p>
          ) : companyRows.map((c) => (
            <CompanyDrawerLink key={c.id} id={c.id} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm group w-full text-left">
              <div className="truncate text-fg group-hover:text-accent transition-colors">{c.name}</div>
              <Bar value={c.open} max={maxCompanyOpen} />
              {c.overdue > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger shrink-0">{c.overdue} overdue</span>}
            </CompanyDrawerLink>
          ))}
        </div>
      </section>

      {totalDocs > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">Compliance by company</p>
          <div className="glass elevated rounded-2xl p-4 space-y-2.5">
            {docCompanyRows.map((c) => (
              <Link key={c.id} href="/documents" className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm group">
                <div className="truncate text-fg group-hover:text-accent transition-colors">{c.name}</div>
                <div className="flex items-center h-2.5 rounded-full overflow-hidden bg-bg-muted">
                  {c.expired > 0 && <div className="h-full bg-danger" style={{ width: `${(c.expired / c.total) * 100}%` }} title={`${c.expired} expired`} />}
                  {c.expiring > 0 && <div className="h-full bg-warn" style={{ width: `${(c.expiring / c.total) * 100}%` }} title={`${c.expiring} expiring`} />}
                  {c.valid > 0 && <div className="h-full bg-success" style={{ width: `${(c.valid / c.total) * 100}%` }} title={`${c.valid} valid`} />}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.expired > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-danger-soft/60 text-danger">{c.expired}</span>}
                  {c.expiring > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-warn-soft/60 text-warn">{c.expiring}</span>}
                  <span className="text-[11px] text-fg-subtle tabular w-6 text-right">{c.total}</span>
                </div>
              </Link>
            ))}
            <p className="text-[11px] text-fg-subtle pt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" /> expired</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warn" /> expiring</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> valid</span>
              {unassignedDocs > 0 && <span className="ml-auto">{unassignedDocs} not linked to a company</span>}
            </p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2 px-1">Status distribution</p>
          <div className="glass elevated rounded-2xl p-4 space-y-2.5">
            {statuses.map((s) => (
              <div key={s.status} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{s.status}</div>
                <Bar value={s.count} max={maxStatus} tone={statusTone(s.status)} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2 px-1">Priority breakdown</p>
          <div className="glass elevated rounded-2xl p-4 space-y-2.5">
            {priorities.map((p) => (
              <div key={p.priority} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{p.priority}</div>
                <Bar value={p.count} max={maxPrio} tone={p.priority === "Critical" ? "danger" : p.priority === "High" ? "warn" : p.priority === "Medium" ? "info" : "accent"} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
