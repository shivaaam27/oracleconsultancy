import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { getPortalPerson, colleagueCompanyScope } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { computeCompanyKpisForCompanies } from "@/lib/company-kpis";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { StudioCompanies } from "@/components/studio/companies/studio-companies";
import { StudioPathsProvider } from "@/components/studio/studio-paths";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies — Oracle Consultancy" };

/**
 * Companies for a member of STAFF (26 Sept 2026) — the owner's and directors'
 * Companies screen over THEIR companies, read-only: headcount, open, late and
 * done this month, as numbers (the old Directory showed the same). The task
 * lists behind those numbers are not theirs to open.
 */
export default async function PortalCompaniesPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "staff") redirect("/portal/directory?tab=companies");

  const [scope, rows, { data: cos }, personCompanies, logos] = await Promise.all([
    colleagueCompanyScope(me),
    getAllTasks(),
    sb.from("companies").select("id,name,accent_color,code_prefix").eq("active", true).order("name"),
    getPersonCompaniesMap(),
    getCompanyLogoMap(),
  ]);
  const mine = new Set(scope ?? []);
  const list = (cos ?? []).filter((c) => mine.has(c.id as number)).map((c) => ({ id: c.id as number, name: c.name as string, accent: (c.accent_color as string | null) ?? null }));
  const kpis = computeCompanyKpisForCompanies(rows, list);
  const staffBy = new Map<number, number>();
  for (const cids of personCompanies.values()) for (const cid of cids) staffBy.set(cid, (staffBy.get(cid) ?? 0) + 1);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const doneBy = new Map<number, number>();
  for (const r of rows) if ((r.status === "Completed" || r.status === "Closed") && r.closedDate && r.closedDate.getTime() >= monthStart) doneBy.set(r.companyId, (doneBy.get(r.companyId) ?? 0) + 1);
  const prefix = new Map((cos ?? []).map((c) => [c.id as number, ((c.code_prefix as string | null) ?? "").toUpperCase()]));

  return (
    <StudioPathsProvider staff>
      <StudioCompanies data={{
        companies: kpis.map((c) => ({
          id: c.id, name: c.name, prefix: prefix.get(c.id) || c.name.slice(0, 2).toUpperCase(),
          staff: staffBy.get(c.id) ?? 0, open: c.open, late: c.overdue, done: doneBy.get(c.id) ?? 0, logo: logos.get(c.id) ?? null,
        })),
        departments: [], sites: [], roles: [], readOnly: true,
      }} />
    </StudioPathsProvider>
  );
}
