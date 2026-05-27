import { PageHeader } from "@/components/ui";
import { PeopleTable } from "@/components/people-table";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [people, { data: companiesRaw }] = await Promise.all([
    getAllPeopleWithWorkload(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
  }));

  const activeCount = people.filter((p) => p.active).length;
  const overdueLoad = people.filter((p) => p.active && p.workload.overdue > 0).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="People Directory"
        sub={`${activeCount} active · ${overdueLoad} carrying overdue work`}
      />
      <PeopleTable people={people} companies={companies} />
    </div>
  );
}
