// The talent pool.

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listCandidates } from "@/lib/recruitment";
import { getSavedViewsFor } from "@/lib/saved-views";
import { RecruitmentCandidatesList, type CandidateRow } from "@/components/recruitment-candidates-list";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";
export const metadata = { title: "Candidates — Recruitment" };

export default async function CandidatesPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const [candidates, savedViews] = await Promise.all([
    listCandidates(companyId, true),
    getSavedViewsFor("rec_candidate"),
  ]);

  const rows: CandidateRow[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    sector: c.sector,
    seniority: c.seniority,
    expectedSalaryUsd: c.expectedSalaryUsd,
    passportExpiry: c.passportExpiry,
    consentSignedOn: c.consentSignedOn,
    engagementSignedOn: c.engagementSignedOn,
    archived: c.archived,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Candidates"
        sub="The people Oracle can put forward. They pay nothing, ever — there is nowhere on this screen to record a fee, and that is deliberate."
      />
      <RecruitmentCandidatesList items={rows} companyId={companyId} savedViews={savedViews} />
    </div>
  );
}
