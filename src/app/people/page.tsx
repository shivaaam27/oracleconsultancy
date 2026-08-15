import { PeopleTable } from "@/components/people-table";
import { NewPersonButton } from "@/components/new-person-button";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [people, { data: companiesRaw }, { data: departmentsRaw }, { data: sitesRaw }, { data: rolesRaw }, logoMap] = await Promise.all([
    getAllPeopleWithWorkload(),
    sb.from("companies").select("id,name,accent_color").order("name"),
    sb.from("departments").select("name").order("name"),
    sb.from("sites").select("name").eq("active", true).order("name"),
    sb.from("job_titles").select("name").eq("active", true).order("name"),
    getCompanyLogoMap(),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
    logoUrl: logoMap.get(c.id as number) ?? null,
  }));
  const departments = (departmentsRaw ?? []).map((d) => d.name as string);
  const sites = (sitesRaw ?? []).map((s) => s.name as string);
  const roles = (rolesRaw ?? []).map((r) => r.name as string);

  // Directory hints (2f): who's on leave today + this-month attendance. Attendance
  // is empty until the register is used, so its chip simply lights up when there's data.
  const todayKey = new Date().toISOString().slice(0, 10);
  const mNow = new Date();
  const monthStart = new Date(Date.UTC(mNow.getUTCFullYear(), mNow.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(mNow.getUTCFullYear(), mNow.getUTCMonth() + 1, 1)).toISOString();
  const [{ data: leaveRows }, { data: attRows }] = await Promise.all([
    sb.from("leave_requests").select("person_id,start_date,end_date").eq("status", "Approved"),
    sb.from("attendance").select("person_id,status").gte("date", monthStart).lt("date", monthEnd),
  ]);
  const directoryHints: Record<number, { onLeave: boolean; present: number; absent: number }> = {};
  for (const r of leaveRows ?? []) {
    if ((r.start_date as string).slice(0, 10) <= todayKey && (r.end_date as string).slice(0, 10) >= todayKey) {
      const pid = r.person_id as number;
      directoryHints[pid] = { ...(directoryHints[pid] ?? { onLeave: false, present: 0, absent: 0 }), onLeave: true };
    }
  }
  for (const r of attRows ?? []) {
    const pid = r.person_id as number;
    const h = directoryHints[pid] ?? { onLeave: false, present: 0, absent: 0 };
    const s = (r.status as string) ?? "";
    if (s === "Present" || s === "Remote") h.present++;
    else if (s === "Absent") h.absent++;
    directoryHints[pid] = h;
  }

  // For the manager dropdown in the create dialog — derived from already-loaded data
  const peopleList = people.map((p) => ({ id: p.id, name: p.name, active: p.active }));

  const siteCount = new Set(
    people.flatMap((p) => [p.workSiteName, p.residenceName].filter(Boolean) as string[])
  ).size;

  return (
    <div className="space-y-4">
      <HrmsCrumbs from={from} />
      <PeopleTable
        people={people}
        companies={companies}
        directoryHints={directoryHints}
        totalCompanies={companies.length}
        totalSites={siteCount}
        createSlot={
          <div className="flex items-center gap-2">
            <NewPersonButton companies={companies} peopleList={peopleList} departments={departments} sites={sites} roles={roles} />
          </div>
        }
      />
    </div>
  );
}
