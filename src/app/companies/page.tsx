import { getAllTasks } from "@/lib/tasks/queries";
import { getCompanyLogoMap } from "@/lib/companies/company-brand";
import { computeCompanyKpisForCompanies } from "@/lib/tasks/company-kpis";
import { getPersonCompaniesMap } from "@/lib/people/people-queries";
import { sb } from "@/db/supabase";
import { getDepartmentsAdmin } from "@/lib/people/departments";
import { getSitesAdmin } from "@/lib/people/sites";
import { getRolesAdmin } from "@/lib/auth/roles";
import { StudioCompanies } from "@/components/studio/companies/studio-companies";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";


export default async function CompaniesPage() {
  // The owner, or a director — who sees their own companies to open, and
  // none of the owner's reference lists (lib/auth/viewer.ts).
  const viewer = await getViewer();
  if (!viewer) redirect("/portal");
  const director = viewer.kind === "director";
  const none = <T,>(v: T) => Promise.resolve(v);
  const [rows, departments, sites, roles, allCompanies, personCompanies, logos] = await Promise.all([
    getAllTasks(),
    director ? none([] as Awaited<ReturnType<typeof getDepartmentsAdmin>>) : getDepartmentsAdmin(),
    director ? none([] as Awaited<ReturnType<typeof getSitesAdmin>>) : getSitesAdmin(),
    director ? none([] as Awaited<ReturnType<typeof getRolesAdmin>>) : getRolesAdmin(),
    sb.from("companies").select("id,name,accent_color,code_prefix").eq("active", true).order("name"),
    getPersonCompaniesMap(),
    getCompanyLogoMap(),
  ]);
  // Each task counts once, under the company it is filed under (see
  // company-kpis.ts for why not its people's companies). Every active company
  // gets a card, so a task-less one still shows.
  const companyList = (allCompanies.data ?? []).filter((c) => viewer.scope == null || viewer.scope.includes(c.id as number)).map((c) => ({
    id: c.id as number, name: c.name as string, accent: (c.accent_color as string | null) ?? null,
  }));
  const companies = computeCompanyKpisForCompanies(rows, companyList);
  // Active staff per company = anyone whose primary company OR an extra link
  // points at it. (Staff DO count under every company they work for.)
  const staffByCompany = new Map<number, number>();
  for (const cids of personCompanies.values()) {
    for (const cid of cids) staffByCompany.set(cid, (staffByCompany.get(cid) ?? 0) + 1);
  }
  // Portfolio totals come from the same rows, so they equal the sum of the cards.

  // Studio (Settings → New look → Companies): mockup board Companies.
  // "Done" on a tile is done THIS MONTH, so the tiles add up to the
  // portfolio card's "done this month" (same rule as signals.ts).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const doneByCompany = new Map<number, number>();
  for (const r of rows) {
    if ((r.status === "Completed" || r.status === "Closed") && r.closedDate && r.closedDate.getTime() >= monthStart) {
      doneByCompany.set(r.companyId, (doneByCompany.get(r.companyId) ?? 0) + 1);
    }
  }
  const prefixById = new Map((allCompanies.data ?? []).map((c) => [c.id as number, ((c.code_prefix as string | null) ?? "").toUpperCase()]));
  return (
    <StudioCompanies data={{
      companies: companies.map((c) => ({
        id: c.id, name: c.name, prefix: prefixById.get(c.id) || c.name.slice(0, 2).toUpperCase(),
        staff: staffByCompany.get(c.id) ?? 0, open: c.open, late: c.overdue, done: doneByCompany.get(c.id) ?? 0,
        logo: logos.get(c.id) ?? null,
      })),
      departments, sites, roles, readOnly: director,
    }} />
  );
}
