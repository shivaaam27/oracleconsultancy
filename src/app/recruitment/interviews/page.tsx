// The interview diary — what is coming up, and what happened and was never
// written down.

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listInterviews } from "@/lib/recruitment";
import { InterviewsList, type InterviewListRow } from "@/components/recruitment-chase-lists";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const interviews = await listInterviews(companyId);
  const rows: InterviewListRow[] = interviews.map((i) => ({
    id: i.id,
    orderRef: i.orderRef,
    orderTitle: i.orderTitle,
    clientName: i.clientName,
    candidateName: i.candidateName,
    kind: i.kind,
    scheduledFor: i.scheduledFor,
    outcome: i.outcome,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interviews"
        sub="Every time is shown in Dar es Salaam and India together — coordinating across the difference is the work."
      />
      <InterviewsList rows={rows} />
    </div>
  );
}
