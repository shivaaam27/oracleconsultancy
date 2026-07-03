import { redirect } from "next/navigation";
import { getPortalPerson, seesAllCompanies, companyScope } from "@/lib/portal-auth";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { generateDrafts } from "@/lib/outbox/gen";
import { getGivenName } from "@/lib/names";
import { Hero, TONE, type Tone } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { PortalOutboxLive, type OutboxPerson } from "./portal-outbox-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outbox — Oracle Consultancy" };

/** Portal Outbox — a LIVE, per-person reminder view. Every person with open tasks
 *  is listed once; their card holds the full open-task list and the send actions
 *  (WhatsApp / Email a summary, group-wise). Nothing is stored: it regenerates from
 *  current data on every load, so there are no duplicate or stale drafts. Per-task
 *  reminders live under each task (this task → WhatsApp, or the group → Chat).
 *  Director/HR see everyone; a manager sees only their team. */
export default async function PortalOutboxPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal"); // management only

  const groupWide = seesAllCompanies(me);
  let drafts = await generateDrafts();
  if (!groupWide) {
    // Two-part scoping so a manager / company-scoped director only ever sees work
    // for the companies they govern:
    //  1. WHICH PEOPLE appear — their team / everyone in their companies;
    //  2. WHICH TASKS show per person — ONLY tasks in the viewer's companies.
    // Without (2) a shared staffer's other-company tasks would leak into the
    // summary (e.g. an MES manager seeing a person's Terra Green tasks).
    const scope = await companyScope(me); // null = every company (never here — not group-wide)
    const scopeSet = scope != null ? new Set(scope) : null;

    // WHICH PEOPLE appear is purely company-based (managers AND scoped directors):
    // only people who BELONG to a company in scope. This deliberately excludes a
    // manager's cross-company direct reports — an Oracle/Pamoja manager never sees
    // a report who works only in Tanam/DSC. (Reporting-based reach is a later call.)
    const map = await getPersonCompaniesMap();
    const allowed = new Set(
      [...map.entries()].filter(([, cids]) => cids.some((c) => scopeSet?.has(c))).map(([pid]) => pid)
    );

    drafts = drafts
      .filter((d) => d.personId != null && allowed.has(d.personId))
      .map((d) => (scopeSet ? { ...d, tasks: d.tasks.filter((t) => scopeSet.has(t.companyId)) } : d))
      // Someone whose only open tasks are outside the viewer's companies drops off.
      .filter((d) => d.tasks.length > 0);
  }

  const people: OutboxPerson[] = drafts
    .filter((d) => d.personId != null)
    .map((d) => {
      const overdue = d.tasks.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
      const companies = [...new Set(d.tasks.map((t) => t.companyName).filter(Boolean))];
      return {
        personId: d.personId as number,
        name: d.recipientName,
        total: d.tasks.length,
        overdue,
        companies,
        tasks: d.tasks.map((t) => ({
          code: t.code,
          title: t.actionItem,
          company: t.companyName,
          status: t.status,
          priority: t.priority,
          due: t.deadline
            ? t.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" })
            : null,
          overdue: t.flag === "overdue" || t.flag === "escalate-now",
          accountable: t.assignees.map(getGivenName),
        })),
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.name.localeCompare(b.name));

  const totalTasks = people.reduce((s, p) => s + p.total, 0);
  const totalOverdue = people.reduce((s, p) => s + p.overdue, 0);
  const metrics: { label: string; value: number; tone: Tone }[] = [
    { label: people.length === 1 ? "person" : "people", value: people.length, tone: people.length ? "accent" : "muted" },
    { label: "open tasks", value: totalTasks, tone: totalTasks ? "accent" : "muted" },
    { label: "overdue", value: totalOverdue, tone: totalOverdue ? "danger" : "muted" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={60} />
      <Reveal delay={0}>
        <Hero
          title="Outbox"
          subtitle="Live per-person reminders — everyone with open tasks, ready to send."
        >
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            {metrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold tabular ${TONE[m.tone].text}`}>{m.value}</span>
                <span className="text-[11px] text-fg-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Hero>
      </Reveal>

      <Reveal delay={0.05}>
        <PortalOutboxLive people={people} />
      </Reveal>
    </div>
  );
}
