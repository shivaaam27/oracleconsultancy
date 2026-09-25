import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { getPortalPerson, colleagueCompanyScope } from "@/lib/portal-auth";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { staffColleagueIds, forStaff } from "@/lib/staff-colleagues";
import { StudioPeople } from "@/components/studio/people/studio-people";
import { StudioPathsProvider } from "@/components/studio/studio-paths";
import { isStaffLikeRole } from "@/lib/director-routes";

export const dynamic = "force-dynamic";
export const metadata = { title: "People — Oracle Consultancy" };

/**
 * People for a member of STAFF (26 Sept 2026) — the owner's and directors'
 * People screen, over their colleagues, read-only, "own work only": no
 * workload, no portal levels, no private details (cut in lib/staff-colleagues).
 * Everyone else keeps the Directory until their turn.
 */
export default async function PortalPeoplePage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (!isStaffLikeRole(me.portalRole)) redirect("/portal/directory");

  const [all, ids, scope, { data: cos }] = await Promise.all([
    getAllPeopleWithWorkload(),
    staffColleagueIds(me),
    colleagueCompanyScope(me),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
  ]);
  const people = all.filter((p) => p.active && ids.has(p.id)).map(forStaff);
  // Only their own companies — a colleague may also work for one they are not in.
  const mine = new Set(scope ?? []);
  const companies = (cos ?? []).filter((c) => mine.has(c.id as number)).map((c) => ({ id: c.id as number, name: c.name as string }));

  return (
    <StudioPathsProvider staff>
      <StudioPeople people={people} companies={companies} readOnly />
    </StudioPathsProvider>
  );
}
