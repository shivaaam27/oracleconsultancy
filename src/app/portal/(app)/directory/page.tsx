import { redirect } from "next/navigation";
import { getPortalPerson, seesAllCompanies, colleagueCompanyScope, commandCentrePersonIds } from "@/lib/portal-auth";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { waLink, mailtoLink } from "@/lib/outbox/links";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { DirectoryView, type DirectoryPerson, type DirectoryCompany, type DirectoryAttendance } from "./directory-view";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { teamAttendanceToday } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const isOverdueFlag = (f: string) => f === "overdue" || f === "escalate-now";

/** Directory — a READ-ONLY contact book: a searchable list of active people with
 *  quick call/WhatsApp/email links, plus a list of companies. Simpler than the
 *  admin /people. Group-wide roles (director/HR) see the whole portfolio; managers
 *  AND staff are scoped to ALL the companies THEY belong to (a person may work for
 *  more than one — primary company ∪ person_companies) — for staff this is a
 *  colleague contact book (call/WhatsApp/email; no profile links, those page-guard
 *  them out). A multi-company colleague appears in the directory of EVERY company
 *  they work in, not just their primary one.
 *
 *  Deliberately omits pay, national IDs, passports and emergency contacts — those
 *  stay admin-only. Each row links to the existing per-person / per-company portal
 *  pages, which carry their own scope guards. */
export default async function PortalDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: initialTab } = await searchParams;
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const groupWide = seesAllCompanies(me);
  // Non-all-companies viewers are scoped to their company set: managers/staff → the
  // companies THEY belong to; a company-scoped director → their ONE company. An
  // unscoped person (no company at all) must NOT fall through to group-wide data, so
  // we deliberately show them an empty set rather than the whole portfolio.
  const cids = groupWide ? [] : ((await colleagueCompanyScope(me)) ?? []);
  const scopedUnscoped = !groupWide && cids.length === 0;

  // For non-group-wide viewers we must surface multi-company colleagues too: a
  // person whose primary company differs but who is linked to one of MY companies
  // via person_companies should still appear. getPersonCompaniesMap maps each
  // active person -> the full set of companies they belong to, so we keep anyone
  // whose company set intersects mine.
  const personCompaniesMap = groupWide ? null : await getPersonCompaniesMap();
  let visiblePersonIds: number[] | null = null;
  if (!groupWide) {
    const cidSet = new Set(cids);
    const inScope = scopedUnscoped
      ? []
      : [...personCompaniesMap!.entries()]
          .filter(([, theirCids]) => theirCids.some((c) => cidSet.has(c)))
          .map(([pid]) => pid);
    // The Administrator is a default support contact for EVERYONE — always
    // include it even when the viewer shares no company with it.
    visiblePersonIds = [...new Set([...inScope, ...(await commandCentrePersonIds())])];
  }

  // Active people, ordered by name. Managers/staff see only people who share one
  // of their companies (the id list above); director/HR see everyone.
  let peopleQuery = sb
    .from("people")
    .select("id,name,role,email,phone,whatsapp,company_id,companies!company_id(name)")
    .eq("active", true)
    .order("name");
  if (!groupWide) {
    // .in([]) returns nothing — exactly what an unscoped viewer should see.
    peopleQuery = peopleQuery.in("id", visiblePersonIds!);
  }

  // Companies, ordered by name. Managers/staff see only their own companies.
  let companyQuery = sb.from("companies").select("id,name").order("name");
  if (!groupWide) companyQuery = companyQuery.in("id", cids);

  const [{ data: allPeopleRaw }, { data: allCompaniesRaw }, tasksAll] = await Promise.all([
    peopleQuery,
    companyQuery,
    getAllTasks(),
  ]);

  const allPeople = allPeopleRaw;
  const allCompanies = allCompaniesRaw;

  // The full company set per person (primary ∪ person_companies) — drives both the
  // companyIds handed to each row (so a multi-company colleague filters under EVERY
  // company they work in, not just their primary) and the multi-company headcount.
  const companiesMap = personCompaniesMap ?? (await getPersonCompaniesMap());

  const people: DirectoryPerson[] = (allPeople ?? []).map((p) => {
    const company = (Array.isArray(p.companies) ? p.companies[0] : p.companies) as { name: string } | null;
    const phone = (p.phone as string | null) ?? null;
    const wa = ((p.whatsapp as string | null) || phone) ?? null;
    const email = ((p.email as string | null) ?? "").trim() || null;
    const primary = (p.company_id as number | null) ?? null;
    return {
      id: p.id as number,
      name: p.name as string,
      role: (p.role as string | null) ?? null,
      companyId: primary,
      companyIds: companiesMap.get(p.id as number) ?? (primary != null ? [primary] : []),
      company: company?.name ?? null,
      callHref: phone ? `tel:${phone}` : null,
      waHref: waLink(wa, ""),
      mailtoHref: mailtoLink(email, "", ""),
    };
  });

  // Per-company open / overdue counts (open work only).
  const openTasks = tasksAll.filter((t) => isOpen(t.status));
  const openByCompany = new Map<number, number>();
  const overdueByCompany = new Map<number, number>();
  for (const t of openTasks) {
    openByCompany.set(t.companyId, (openByCompany.get(t.companyId) ?? 0) + 1);
    if (isOverdueFlag(t.flag)) overdueByCompany.set(t.companyId, (overdueByCompany.get(t.companyId) ?? 0) + 1);
  }

  // Per-company headcount, from the (already-scoped) people list. Multi-company
  // aware: a person who belongs to several companies counts toward EACH of them,
  // reusing the companyIds already resolved per row above.
  const headcountByCompany = new Map<number, number>();
  for (const p of people) {
    for (const cid of p.companyIds ?? []) headcountByCompany.set(cid, (headcountByCompany.get(cid) ?? 0) + 1);
  }

  const logoMap = await getCompanyLogoMap();
  const companies: DirectoryCompany[] = (allCompanies ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    headcount: headcountByCompany.get(c.id as number) ?? 0,
    open: openByCompany.get(c.id as number) ?? 0,
    overdue: overdueByCompany.get(c.id as number) ?? 0,
    logoUrl: logoMap.get(c.id as number) ?? null,
  }));

  // Attendance today — a manager/HR view. Directors don't need it (board-level
  // operators) and staff never see other people's attendance. Scoped to the same
  // people the viewer can already see in the directory; enriched with company for
  // the tab's filter/search.
  const canSeeAttendance = me.portalRole === "manager" || me.portalRole === "hr";
  let attendance: DirectoryAttendance[] = [];
  if (canSeeAttendance && people.length > 0) {
    const rows = await teamAttendanceToday(people.map((p) => p.id));
    const byId = new Map(people.map((p) => [p.id, p]));
    attendance = rows.map((r) => {
      const person = byId.get(r.id);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        company: person?.company ?? null,
        companyIds: person?.companyIds ?? [],
      };
    });
  }

  const subtitle = groupWide
    ? "Everyone across the group — search, call, message or open a profile."
    : "Your colleagues — search, call or message.";

  return (
    <div className="space-y-4">
      <Reveal>
        <Hero title="Directory" subtitle={subtitle} />
      </Reveal>

      <Reveal delay={0.04}>
        <DirectoryView
          people={people}
          companies={companies}
          attendance={attendance}
          showAttendance={canSeeAttendance}
          canOpenProfiles={me.portalRole !== "staff"}
          initialTab={initialTab}
        />
      </Reveal>
    </div>
  );
}
