// One recruitment client.

import { notFound } from "next/navigation";
import { agencyCompanyId, getClient, listJobOrders } from "@/lib/recruitment";
import { isOpenOrder } from "@/lib/recruitment-shared";
import { RecruitmentClientRecord } from "@/components/recruitment-client-record";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client — Recruitment" };

export default async function RecruitmentClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const companyId = await agencyCompanyId();
  const [c, orders] = await Promise.all([
    getClient(n),
    companyId ? listJobOrders(companyId) : Promise.resolve([]),
  ]);
  if (!c) notFound();

  const openOrders = orders.filter((o) => o.clientId === c.id && isOpenOrder(o.stage)).length;

  return (
    <RecruitmentClientRecord
      client={{
        id: c.id,
        name: c.name,
        sector: c.sector,
        city: c.city,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        localEmployees: c.localEmployees,
        foreignEmployees: c.foreignEmployees,
        termsSignedOn: c.termsSignedOn,
        dsaSignedOn: c.dsaSignedOn,
        notes: c.notes,
        archived: c.archived,
        openOrders,
      }}
    />
  );
}
