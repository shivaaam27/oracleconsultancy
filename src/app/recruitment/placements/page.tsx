// Everyone placed, and where their first month has got to.
//
// The check-in column is the one that matters: six conversations are owed on
// every placement, and the written record of them is what a disputed placement
// is decided on (Terms of Business cl. 6.4).

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listPlacements } from "@/lib/recruitment";
import { PlacementsList, type PlacementListRow } from "@/components/recruitment-chase-lists";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";
export const metadata = { title: "Placements — Recruitment" };

export default async function PlacementsPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const placements = await listPlacements(companyId);
  const rows: PlacementListRow[] = placements.map((p) => ({
    id: p.id,
    orderRef: p.orderRef,
    orderTitle: p.orderTitle,
    clientName: p.clientName,
    candidateName: p.candidateName,
    acceptedOn: p.acceptedOn,
    startedOn: p.startedOn,
    endedOn: p.endedOn,
    monthlyGrossUsd: p.monthlyGrossUsd,
    checkIns: p.checkIns.map((c) => ({ day: c.day, party: c.party })),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Placements"
        sub="The first month, and the six conversations it owes. Whoever is owed the most, first."
      />
      <PlacementsList rows={rows} />
    </div>
  );
}
