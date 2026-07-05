import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { getScopedPickerData } from "@/lib/portal-picker";
import { NewTaskForm } from "./new-task-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New task — Oracle Consultancy" };

export default async function PortalNewTaskPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Task creation is owner-configurable per role (Settings → Portals).
  if (!me.caps.createTasks) redirect("/portal");
  const isDirector = me.portalRole === "director";

  // One scoped source for the pickers (same as the Tasks page + board): portfolio
  // director / HR get everything; a company-scoped director gets their companies;
  // a manager gets the companies they belong to + the people in them. The composer
  // narrows people to the selected company on top of this.
  const { companies, people } = await getScopedPickerData(me);
  const sortedPeople = [...people].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));

  return <NewTaskForm me={{ id: me.id, name: me.name }} people={sortedPeople} companies={companies} isDirector={isDirector} />;
}
