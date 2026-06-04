import { getAllTasks, statusBreakdown, priorityBreakdown, type TaskRow } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { sb } from "@/db/supabase";
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

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader title="Insights" sub="Portfolio distribution across companies, status, and priority." />

      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">Open by company</p>
        <div className="glass elevated rounded-2xl p-4 space-y-2.5">
          {companyRows.length === 0 ? (
            <p className="text-sm text-fg-muted py-2">No open tasks. 🎉</p>
          ) : companyRows.map((c) => (
            <Link key={c.id} href={`/companies/${c.id}`} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm group">
              <div className="truncate text-fg group-hover:text-accent transition-colors">{c.name}</div>
              <Bar value={c.open} max={maxCompanyOpen} />
              {c.overdue > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft/60 ring-1 ring-danger/25 text-danger shrink-0">{c.overdue} overdue</span>}
            </Link>
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
