import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Briefcase, Building2, CalendarDays, User } from "lucide-react";
import { getPortalPerson, personCanSeePerson } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

/** Portal person detail — a READ-ONLY, role-scoped view a manager/director can open
 *  from the team roster. Deliberately omits pay, passport/national IDs and emergency
 *  contacts (admin-only). Access is gated by personCanSeePerson (self / direct reports
 *  / group-wide). */
function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-fg-subtle">{icon}</span>
      <span className="w-20 shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

export default async function PortalPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const targetId = Number((await params).id);
  if (!Number.isFinite(targetId) || !(await personCanSeePerson(me, targetId))) notFound();

  const { data: p } = await sb
    .from("people")
    .select("id,name,email,role,company_id,department_id,manager_id,start_date,active")
    .eq("id", targetId)
    .maybeSingle();
  if (!p || p.active !== true) notFound();

  const [companyRes, deptRes, mgrRes, tasksAll] = await Promise.all([
    p.company_id
      ? sb.from("companies").select("name").eq("id", p.company_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    p.department_id
      ? sb.from("departments").select("name").eq("id", p.department_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    p.manager_id
      ? sb.from("people").select("name").eq("id", p.manager_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    getAllTasks(),
  ]);

  const openTasks = tasksAll
    .filter((t) => isOpen(t.status) && t.assigneeIds.includes(targetId))
    .sort((a, b) => {
      const oa = a.flag === "overdue" || a.flag === "escalate-now" ? 0 : 1;
      const ob = b.flag === "overdue" || b.flag === "escalate-now" ? 0 : 1;
      return oa - ob;
    });
  const overdue = openTasks.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;

  const email = ((p.email as string | null) ?? "").trim();
  const companyName = (companyRes.data as { name: string } | null)?.name ?? null;
  const deptName = (deptRes.data as { name: string } | null)?.name ?? null;
  const mgrName = (mgrRes.data as { name: string } | null)?.name ?? null;
  const startLabel = p.start_date
    ? new Date(p.start_date as string).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const canOpenCompany = me.portalRole !== "staff";

  return (
    <div className="space-y-4">
      <Link href="/portal/team" className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft size={14} /> Team
      </Link>

      <Reveal>
        <Hero title={p.name as string} subtitle={[p.role, companyName].filter(Boolean).join(" · ") || undefined} />
      </Reveal>

      <Reveal delay={0.04}>
        <Panel className="space-y-3 p-4">
          <SectionLabel icon={<User size={13} />}>Details</SectionLabel>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
            {email && (
              <Row icon={<Mail size={14} />} label="Email" value={<a href={`mailto:${email}`} className="text-accent hover:underline">{email}</a>} />
            )}
            {p.role && <Row icon={<Briefcase size={14} />} label="Role" value={p.role as string} />}
            {companyName && (
              <Row
                icon={<Building2 size={14} />}
                label="Company"
                value={
                  canOpenCompany && p.company_id ? (
                    <Link href={`/portal/companies/${p.company_id}`} className="text-accent hover:underline">{companyName}</Link>
                  ) : (
                    companyName
                  )
                }
              />
            )}
            {deptName && <Row icon={<Building2 size={14} />} label="Department" value={deptName} />}
            {mgrName && <Row icon={<User size={14} />} label="Manager" value={mgrName} />}
            {startLabel && <Row icon={<CalendarDays size={14} />} label="Started" value={startLabel} />}
          </dl>
        </Panel>
      </Reveal>

      <Reveal delay={0.08}>
        <Panel className="p-4">
          <SectionLabel icon={<Briefcase size={13} />}>
            Open tasks
            {openTasks.length > 0 && (
              <span className="ml-1 text-fg-subtle/70">
                · {openTasks.length}
                {overdue > 0 && <span className="text-danger"> · {overdue} overdue</span>}
              </span>
            )}
          </SectionLabel>
          {openTasks.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">No open tasks.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {openTasks.map((t) => {
                const od = t.flag === "overdue" || t.flag === "escalate-now";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/portal/task/${t.code}`}
                      className="group flex items-center gap-2.5 rounded-xl bg-bg-subtle/50 px-3 py-2 ring-1 ring-border/40 transition-all hover:ring-accent/30"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${od ? "bg-danger" : "bg-accent/70"}`} />
                      <span className="min-w-0 flex-1 truncate text-sm group-hover:text-accent">{t.actionItem}</span>
                      <span className="shrink-0 text-[11px] text-fg-subtle">{t.companyName}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </Reveal>
    </div>
  );
}
