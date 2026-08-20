// What is sitting with a client, awaiting their decision — the chase list.
//
// The company profile promises "regular written progress updates while the role
// is open, including when there is nothing to report — silence is not an
// update". This is the screen that makes that promise keepable: it is ordered by
// who has been waiting longest.

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listShortlistsWithClient } from "@/lib/recruitment";
import { ShortlistChaseList, type ChaseRow } from "@/components/recruitment-chase-lists";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";

export default async function ShortlistsPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const entries = await listShortlistsWithClient(companyId);
  const rows: ChaseRow[] = entries.map((s) => ({
    id: s.id,
    orderRef: s.orderRef,
    orderTitle: s.orderTitle,
    clientName: s.clientName,
    candidateName: s.candidateName,
    candidateSeniority: s.candidateSeniority,
    stage: s.stage,
    sentToClientOn: s.sentToClientOn,
    matchNote: s.matchNote,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="With the client"
        sub="Shortlists awaiting a decision, longest wait first. Silence is not an update — chase the top of this list."
      />
      <ShortlistChaseList rows={rows} />
    </div>
  );
}
