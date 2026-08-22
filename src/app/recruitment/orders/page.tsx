// The live book — every role Oracle is working on.

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listJobOrders, listClients } from "@/lib/recruitment";
import { getSavedViewsFor } from "@/lib/saved-views";
import { RecruitmentOrdersList, type OrderRow } from "@/components/recruitment-orders-list";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job orders — Recruitment" };

export default async function JobOrdersPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const [orders, clients, savedViews] = await Promise.all([
    listJobOrders(companyId, true),
    listClients(companyId),
    getSavedViewsFor("rec_job_order"),
  ]);

  // Everything crossing into the client component is plain and serialisable.
  const rows: OrderRow[] = orders.map((o) => ({
    id: o.id,
    ref: o.ref,
    title: o.title,
    clientId: o.clientId,
    clientName: o.clientName,
    sector: o.sector,
    seniority: o.seniority,
    monthlyGrossUsd: o.monthlyGrossUsd,
    stage: o.stage,
    openedOn: o.openedOn,
    targetStartOn: o.targetStartOn,
    archived: o.archived,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Job orders"
        sub="One row per role. The fee is one month of the agreed gross salary — worked out here, never stored."
      />
      <RecruitmentOrdersList
        items={rows}
        companyId={companyId}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        savedViews={savedViews}
      />
    </div>
  );
}
