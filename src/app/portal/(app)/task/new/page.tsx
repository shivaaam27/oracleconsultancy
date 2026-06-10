import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { getPortalPerson, directReportIds } from "@/lib/portal-auth";
import { NewTaskForm } from "./new-task-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New task — Oracle Consultancy" };

export default async function PortalNewTaskPage() {
  const me = (await getPortalPerson())!;
  // Only managers can create tasks.
  if (me.portalRole !== "manager") redirect("/portal");

  const reportIds = await directReportIds(me.id);
  const ids = Array.from(new Set([me.id, ...reportIds]));

  const { data: peopleRows } = await sb.from("people").select("id,name,company_id").in("id", ids);
  const people = (peopleRows ?? [])
    .map((p) => ({ id: p.id as number, name: p.name as string }))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));

  // Companies those people belong to.
  const companyIds = Array.from(new Set((peopleRows ?? []).map((p) => p.company_id as number).filter(Boolean)));
  let companies: Array<{ id: number; name: string }> = [];
  if (companyIds.length > 0) {
    const { data: compRows } = await sb.from("companies").select("id,name").in("id", companyIds).order("name");
    companies = (compRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  }

  return <NewTaskForm me={{ id: me.id, name: me.name }} people={people} companies={companies} />;
}
