// The employers Oracle sources for.

import { PageHeader } from "@/components/ui";
import { agencyCompanyId, listClients, listJobOrders } from "@/lib/recruitment";
import { getSavedViewsFor } from "@/lib/saved-views";
import { isOpenOrder } from "@/lib/recruitment-shared";
import { RecruitmentClientsList, type ClientRow } from "@/components/recruitment-clients-list";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";

export default async function RecruitmentClientsPage() {
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const [clients, orders, savedViews] = await Promise.all([
    listClients(companyId, true),
    listJobOrders(companyId),
    getSavedViewsFor("rec_client"),
  ]);

  // Counted here rather than stored — one query already has the orders in hand.
  const openPerClient = new Map<number, number>();
  for (const o of orders) {
    if (o.clientId == null || !isOpenOrder(o.stage)) continue;
    openPerClient.set(o.clientId, (openPerClient.get(o.clientId) ?? 0) + 1);
  }

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    sector: c.sector,
    city: c.city,
    contactName: c.contactName,
    termsSignedOn: c.termsSignedOn,
    dsaSignedOn: c.dsaSignedOn,
    openOrders: openPerClient.get(c.id) ?? 0,
    archived: c.archived,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        sub="The employers in Tanzania. Sourcing does not start until the Terms of Business is signed."
      />
      <RecruitmentClientsList items={rows} companyId={companyId} savedViews={savedViews} />
    </div>
  );
}
