import { sb } from "@/db/supabase";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { companyScope, type PortalPerson } from "@/lib/portal-auth";

export type PickerPerson = { id: number; name: string; companyId: number | null; companyIds: number[] };
export type PickerCompany = { id: number; name: string };

/** Companies + people for the portal create-pickers (task AND event forms),
 *  scoped to the viewer's permission through the ONE scope helper
 *  (`companyScope`), so every create surface shows the SAME scoped lists:
 *   • portfolio director / HR → all companies, all active people;
 *   • company-scoped director → their companies + people who belong to them;
 *   • manager → the companies they belong to + people in those companies.
 *
 *  The viewer themselves is always included in the people list (a manager can
 *  assign to / invite themselves). The task/event forms then narrow the people
 *  picker further to the SELECTED company on top of this. */
export async function getScopedPickerData(
  me: PortalPerson,
): Promise<{ companies: PickerCompany[]; people: PickerPerson[] }> {
  const [scope, { data: companiesRaw }, { data: peopleRaw }, personCompanies] = await Promise.all([
    companyScope(me), // null = every company
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    getPersonCompaniesMap(),
  ]);

  let companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  let people: PickerPerson[] = (peopleRaw ?? []).map((p) => {
    const id = p.id as number;
    const primary = (p.company_id as number | null) ?? null;
    return { id, name: p.name as string, companyId: primary, companyIds: personCompanies.get(id) ?? (primary != null ? [primary] : []) };
  });

  if (scope != null) {
    const set = new Set(scope);
    companies = companies.filter((c) => set.has(c.id));
    people = people.filter((p) => p.id === me.id || p.companyIds.some((c) => set.has(c)));
  }

  return { companies, people };
}
