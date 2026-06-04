import { PageHeader } from "@/components/ui";
import { PeopleTable } from "@/components/people-table";
import { NewPersonButton } from "@/components/new-person-button";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [people, { data: companiesRaw }] = await Promise.all([
    getAllPeopleWithWorkload(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
  }));

  // For the manager dropdown in the create dialog — derived from already-loaded data
  const peopleList = people.map((p) => ({ id: p.id, name: p.name, active: p.active }));

  const activeCount = people.filter((p) => p.active).length;
  const overdueLoad = people.filter((p) => p.active && p.workload.overdue > 0).length;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="People Directory"
        sub={`${activeCount} active · ${overdueLoad} carrying overdue work`}
        action={<NewPersonButton companies={companies} peopleList={peopleList} />}
      />
      <PeopleTable people={people} companies={companies} />
    </div>
  );
}
