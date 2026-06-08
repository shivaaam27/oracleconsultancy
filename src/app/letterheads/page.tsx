import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { LetterheadEditor } from "@/components/letterhead-editor";
import { listCompanyLetterheads } from "./actions";

export const dynamic = "force-dynamic";

export default async function LetterheadsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const companies = await listCompanyLetterheads();
  const complete = companies.filter((c) => c.address && c.signatoryName).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Company letterheads"
        sub={`${complete} of ${companies.length} set up · used on all generated letters`}
      />
      <p className="text-xs text-fg-muted">
        These details appear at the top of every letter for the company. You can also edit them while
        writing a letter — changes save back here.
      </p>
      <div className="space-y-3">
        {companies.map((c) => (
          <LetterheadEditor key={c.id} company={c} />
        ))}
      </div>
    </div>
  );
}
