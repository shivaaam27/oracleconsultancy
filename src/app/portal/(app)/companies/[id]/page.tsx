import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { getPortalPerson, personCanSeeCompany } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

/** Portal company detail — a READ-ONLY, role-scoped company view (group-wide roles:
 *  any company; managers: their own). Operational only: headcount + open work. No
 *  financials. Gated by personCanSeeCompany. */
function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "muted" }) {
  return (
    <div className="rounded-2xl bg-bg-subtle/50 px-3 py-3 text-center ring-1 ring-border/40">
      <div className={`text-xl font-semibold tabular ${tone === "danger" && value > 0 ? "text-danger" : "text-fg"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-muted">{label}</div>
    </div>
  );
}

export default async function PortalCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const companyId = Number((await params).id);
  if (!Number.isFinite(companyId) || !(await personCanSeeCompany(me, companyId))) notFound();

  const [companyRes, headcountRes, tasksAll] = await Promise.all([
    sb.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    sb.from("people").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    getAllTasks(),
  ]);
  const company = companyRes.data as { id: number; name: string } | null;
  if (!company) notFound();

  const open = tasksAll
    .filter((t) => t.companyId === companyId && isOpen(t.status))
    .sort((a, b) => {
      const oa = a.flag === "overdue" || a.flag === "escalate-now" ? 0 : 1;
      const ob = b.flag === "overdue" || b.flag === "escalate-now" ? 0 : 1;
      return oa - ob;
    });
  const overdue = open.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
  const headcount = headcountRes.count ?? 0;

  return (
    <div className="space-y-4">
      <Link href="/portal/board" className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft size={14} /> Board
      </Link>

      <Reveal>
        <Hero
          title={
            <span className="flex items-center gap-2.5">
              <Building2 size={24} strokeWidth={1.75} className="text-accent" />
              {company.name}
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Headcount" value={headcount} />
            <Stat label="Open tasks" value={open.length} />
            <Stat label="Overdue" value={overdue} tone="danger" />
          </div>
        </Hero>
      </Reveal>

      <Reveal delay={0.06}>
        <Panel className="p-4">
          <SectionLabel icon={<ClipboardCheck size={13} />}>
            Open tasks
            {open.length > 0 && <span className="ml-1 text-fg-subtle/70">· {open.length}</span>}
          </SectionLabel>
          {open.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">No open tasks for this company.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {open.slice(0, 20).map((t) => {
                const od = t.flag === "overdue" || t.flag === "escalate-now";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/portal/task/${t.code}`}
                      className="group flex items-center gap-2.5 rounded-xl bg-bg-subtle/50 px-3 py-2 ring-1 ring-border/40 transition-all hover:ring-accent/30"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${od ? "bg-danger" : "bg-accent/70"}`} />
                      <span className="min-w-0 flex-1 truncate text-sm group-hover:text-accent">{t.actionItem}</span>
                      {od && <AlertTriangle size={13} className="shrink-0 text-danger" />}
                    </Link>
                  </li>
                );
              })}
              {open.length > 20 && <li className="pl-3.5 text-xs text-fg-subtle">+{open.length - 20} more</li>}
            </ul>
          )}
        </Panel>
      </Reveal>
    </div>
  );
}
