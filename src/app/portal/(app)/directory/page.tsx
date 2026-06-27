import { redirect } from "next/navigation";
import { getPortalPerson, isGroupWide } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { waLink, mailtoLink } from "@/lib/outbox/links";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { DirectoryView, type DirectoryPerson, type DirectoryCompany } from "./directory-view";

export const dynamic = "force-dynamic";

const isOverdueFlag = (f: string) => f === "overdue" || f === "escalate-now";

/** Directory — a READ-ONLY contact book for the DIRECTOR (and HR): a searchable
 *  list of every active person with quick call/WhatsApp/email links, plus a list
 *  of all companies. Simpler than the admin /people. Group-wide roles see the
 *  whole portfolio; a manager is scoped to their own company only.
 *
 *  Deliberately omits pay, national IDs, passports and emergency contacts — those
 *  stay admin-only. Each row links to the existing per-person / per-company portal
 *  pages, which carry their own scope guards. */
export default async function PortalDirectoryPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal");

  const groupWide = isGroupWide(me.portalRole);

  // Active people, ordered by name. Managers see only their own company.
  let peopleQuery = sb
    .from("people")
    .select("id,name,role,email,phone,whatsapp,company_id,companies(name)")
    .eq("active", true)
    .order("name");
  if (!groupWide && me.companyId != null) peopleQuery = peopleQuery.eq("company_id", me.companyId);

  // Companies, ordered by name. Managers see only their own.
  let companyQuery = sb.from("companies").select("id,name").order("name");
  if (!groupWide && me.companyId != null) companyQuery = companyQuery.eq("id", me.companyId);

  const [{ data: allPeople }, { data: allCompanies }, tasksAll] = await Promise.all([
    peopleQuery,
    companyQuery,
    getAllTasks(),
  ]);

  const people: DirectoryPerson[] = (allPeople ?? []).map((p) => {
    const company = (Array.isArray(p.companies) ? p.companies[0] : p.companies) as { name: string } | null;
    const phone = (p.phone as string | null) ?? null;
    const wa = ((p.whatsapp as string | null) || phone) ?? null;
    const email = ((p.email as string | null) ?? "").trim() || null;
    return {
      id: p.id as number,
      name: p.name as string,
      role: (p.role as string | null) ?? null,
      companyId: (p.company_id as number | null) ?? null,
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

  // Per-company headcount, from the (already-scoped) people list.
  const headcountByCompany = new Map<number, number>();
  for (const p of people) {
    if (p.companyId != null) headcountByCompany.set(p.companyId, (headcountByCompany.get(p.companyId) ?? 0) + 1);
  }

  const companies: DirectoryCompany[] = (allCompanies ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    headcount: headcountByCompany.get(c.id as number) ?? 0,
    open: openByCompany.get(c.id as number) ?? 0,
    overdue: overdueByCompany.get(c.id as number) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <Reveal>
        <Hero title="Directory" subtitle="Everyone across the group — search, call, message or open a profile." />
      </Reveal>

      <Reveal delay={0.04}>
        <DirectoryView people={people} companies={companies} />
      </Reveal>
    </div>
  );
}
