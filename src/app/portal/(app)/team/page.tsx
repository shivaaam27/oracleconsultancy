import { redirect } from "next/navigation";
import { getPortalPerson, managerTeamIds } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { AutoRefresh } from "@/components/auto-refresh";
import { waLink } from "@/lib/outbox/links";
import { TeamView } from "./team-view";
import type { TeamPerson } from "./person-card";

export const dynamic = "force-dynamic";

/** Compact deadline in the operator's zone, e.g. "13 Jun". */
function fmtDue(d: Date | null): string | null {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : null;
}

const isOverdueFlag = (f: string) => f === "overdue" || f === "escalate-now";

/** Team — Director / Manager / Admin. One merged list: every active person, with
 *  their open tasks inline + contact/reminder/profile icons. */
export default async function PortalTeamPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal");

  const tasks = (await getAllTasks()).filter((t) => isOpen(t.status));
  const byPerson = new Map<number, typeof tasks>();
  for (const t of tasks) {
    for (const pid of t.assigneeIds) {
      const l = byPerson.get(pid) ?? [];
      l.push(t);
      byPerson.set(pid, l);
    }
  }

  // Director / HR see everyone group-wide; a manager's team is scoped to their
  // own company plus any direct reports (matching their task visibility), so a
  // newly-created manager isn't shown the whole portfolio.
  const teamIds = me.portalRole === "manager" ? await managerTeamIds(me) : null;
  let peopleQuery = sb
    .from("people")
    .select("id,name,role,email,phone,whatsapp,company_id,companies(name)")
    .eq("active", true)
    .order("name");
  if (teamIds) peopleQuery = peopleQuery.in("id", teamIds.length > 0 ? teamIds : [-1]);
  const { data: allPeople } = await peopleQuery;

  const people: TeamPerson[] = (allPeople ?? [])
    .map((p) => {
      const ts = (byPerson.get(p.id as number) ?? []).sort(
        (a, b) => (isOverdueFlag(a.flag) ? 0 : 1) - (isOverdueFlag(b.flag) ? 0 : 1),
      );
      const overdue = ts.filter((t) => isOverdueFlag(t.flag)).length;
      const company = (Array.isArray(p.companies) ? p.companies[0] : p.companies) as { name: string } | null;
      const phone = (p.phone as string | null) ?? null;
      const wa = ((p.whatsapp as string | null) || phone) ?? null;
      const email = (p.email as string | null) ?? null;
      return {
        id: p.id as number,
        name: p.name as string,
        role: (p.role as string | null) ?? null,
        company: company?.name ?? null,
        open: ts.length,
        overdue,
        hasEmail: !!(email ?? "").trim(),
        callHref: phone ? `tel:${phone}` : null,
        mailtoHref: email ? `mailto:${encodeURIComponent(email)}` : null,
        contactWaHref: waLink(wa, ""),
        details: ts.map((t) => ({
          code: t.code,
          title: t.actionItem,
          company: t.companyName,
          status: t.status,
          priority: t.priority,
          dueLabel: fmtDue(t.deadline),
          overdueDays: t.daysToDeadline != null && Number(t.daysToDeadline) < 0 ? Math.abs(Math.round(Number(t.daysToDeadline))) : null,
          description: t.comments,
          latest: t.latestUpdate,
          responsible: t.assignees.filter(Boolean),
        })),
      };
    })
    // Overdue-first, then most open, then name. People with no open tasks sink down.
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  return (
    <>
      <AutoRefresh seconds={60} />
      <TeamView people={people} />
    </>
  );
}
