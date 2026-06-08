import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { SystemMap } from "@/components/system-map";

export const dynamic = "force-static";

export default async function SystemMapPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="System Map"
        sub="Every area of the system and the pages within it — tap any page to open it."
      />
      <SystemMap />
    </div>
  );
}
