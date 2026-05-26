import { getAllTasks, computeCompanyKpis } from "@/lib/queries";
import { PageHeader, Card, Badge } from "@/components/ui";
import Link from "next/link";
import { Building2, AlertOctagon, CheckCircle2, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const rows = await getAllTasks();
  const companies = computeCompanyKpis(rows);
  return (
    <div className="space-y-6">
      <PageHeader title="Companies" sub={`${companies.length} companies tracked`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((c) => (
          <Link key={c.id} href={`/companies/${c.id}`} className="group">
            <Card className="p-5 hover:border-accent transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-accent-soft text-fg flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <Badge tone={c.riskScore > 50 ? "danger" : c.riskScore > 20 ? "warn" : "success"}>
                  Risk {c.riskScore}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="font-semibold tracking-tight group-hover:text-accent transition-colors">{c.name}</div>
                <div className="text-xs text-fg-muted mt-0.5">{c.total} total tasks</div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border text-xs">
                <div className="flex flex-col items-start gap-1">
                  <div className="text-fg-subtle flex items-center gap-1"><Clock size={11} /> Open</div>
                  <div className="font-semibold tabular text-sm">{c.open}</div>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <div className="text-fg-subtle flex items-center gap-1"><AlertOctagon size={11} /> Overdue</div>
                  <div className={`font-semibold tabular text-sm ${c.overdue ? "text-danger" : ""}`}>{c.overdue}</div>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <div className="text-fg-subtle flex items-center gap-1"><CheckCircle2 size={11} /> Done</div>
                  <div className="font-semibold tabular text-sm">{c.completed}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
