import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { sb } from "@/db/supabase";
import { StudioPeople } from "@/components/studio/people/studio-people";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { viewerPeopleIds } from "@/lib/viewer-scope";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  // The owner, or a director — who sees the people of their companies,
  // read-only, without anyone's private details (lib/viewer.ts).
  const viewer = await getViewer();
  if (!viewer) redirect("/portal");
  const director = viewer.kind === "director";
  const [peopleAll, { data: companiesAll }, logoMap, inScope] = await Promise.all([
    getAllPeopleWithWorkload({ taskScope: viewer.scope }),
    sb.from("companies").select("id,name,accent_color").order("name"),
    getCompanyLogoMap(),
    viewerPeopleIds(viewer),
  ]);
  const companiesRaw = (companiesAll ?? []).filter((c) => viewer.scope == null || viewer.scope.includes(c.id as number));
  // Blanked, not hidden: what a director may not see never reaches the page.
  const people = director
    ? peopleAll
        .filter((p) => p.active && (!inScope || inScope.has(p.id)))
        .map((p) => ({ ...p, nationalId: null, passportNo: null, address: null, dateOfBirth: null, emergencyContactName: null, emergencyContactPhone: null, notes: null }))
    : peopleAll;

  const companies = companiesRaw.map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
    logoUrl: logoMap.get(c.id as number) ?? null,
  }));

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


  // Studio (Settings → New look → People): mockup board People.
  return <StudioPeople people={people} companies={companies.map((c) => ({ id: c.id, name: c.name }))} hints={directoryHints} readOnly={director} />;
}
