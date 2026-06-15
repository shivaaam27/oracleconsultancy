import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { getPortalPerson, directReportIds } from "@/lib/portal-auth";
import { NewTaskForm } from "./new-task-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New task — Oracle Consultancy" };

export default async function PortalNewTaskPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Managers, HR and directors can create tasks. Staff cannot.
  if (me.portalRole === "staff") redirect("/portal");
  const isDirector = me.portalRole === "director";
  // HR and directors both pick from anyone/any company; HR still posts through the
  // ordinary (non-board) action, so it isn't treated as a director here.
  const broad = isDirector || me.portalRole === "hr";

  let people: Array<{ id: number; name: string }>;
  let companies: Array<{ id: number; name: string }>;

  if (broad) {
    // Group-wide: anyone active, any company.
    const [{ data: peopleRows }, { data: compRows }] = await Promise.all([
      sb.from("people").select("id,name").eq("active", true).order("name"),
      sb.from("companies").select("id,name").order("name"),
    ]);
    people = (peopleRows ?? [])
      .map((p) => ({ id: p.id as number, name: p.name as string }))
      .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
    companies = (compRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  } else {
    // Managers: themselves + their direct reports, within those people's companies.
    const reportIds = await directReportIds(me.id);
    const ids = Array.from(new Set([me.id, ...reportIds]));
    const { data: peopleRows } = await sb.from("people").select("id,name,company_id").in("id", ids);
    people = (peopleRows ?? [])
      .map((p) => ({ id: p.id as number, name: p.name as string }))
      .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
    const companyIds = Array.from(new Set((peopleRows ?? []).map((p) => p.company_id as number).filter(Boolean)));
    companies = [];
    if (companyIds.length > 0) {
      const { data: compRows } = await sb.from("companies").select("id,name").in("id", companyIds).order("name");
      companies = (compRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    }
  }

  return <NewTaskForm me={{ id: me.id, name: me.name }} people={people} companies={companies} isDirector={isDirector} />;
}
