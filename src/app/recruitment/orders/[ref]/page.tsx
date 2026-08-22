// One job order — the record, at its own address (/recruitment/orders/JO-2608-01).
//
// Keyed by the REFERENCE rather than the row id, because the reference is what
// everybody says out loud and writes on the paperwork. It is unique per company,
// which is what makes it safe to route on.

import { notFound } from "next/navigation";
import {
  agencyCompanyId, getJobOrder, listClients, listCandidates,
  listShortlist, listInterviewsFor, placementsForOrder,
} from "@/lib/recruitment";
import { RecruitmentOrderRecord } from "@/components/recruitment-order-record";
import { NoAgencyCompany } from "@/components/recruitment-empty";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job order — Recruitment" };

export default async function JobOrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const companyId = await agencyCompanyId();
  if (!companyId) return <NoAgencyCompany />;

  const [order, clients] = await Promise.all([
    getJobOrder(companyId, decodeURIComponent(ref)),
    listClients(companyId),
  ]);
  if (!order) notFound();

  // The shortlist has to be read before its interviews — they hang off it.
  const shortlist = await listShortlist(order.id);
  const [interviews, placements, pool] = await Promise.all([
    listInterviewsFor(shortlist.map((s) => s.id)),
    placementsForOrder(order.id),
    listCandidates(companyId),
  ]);

  return (
    <RecruitmentOrderRecord
      order={{
        id: order.id,
        ref: order.ref,
        title: order.title,
        clientId: order.clientId,
        clientName: order.clientName,
        sector: order.sector,
        seniority: order.seniority,
        monthlyGrossUsd: order.monthlyGrossUsd,
        stage: order.stage,
        openedOn: order.openedOn,
        signedOn: order.signedOn,
        targetStartOn: order.targetStartOn,
        permitExpiry: order.permitExpiry,
        notes: order.notes,
        archived: order.archived,
      }}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      shortlist={shortlist.map((s) => ({
        id: s.id,
        candidateId: s.candidateId,
        stage: s.stage,
        matchNote: s.matchNote,
        declineReason: s.declineReason,
        sentToClientOn: s.sentToClientOn,
        candidateName: s.candidateName,
        candidateTitle: s.candidateTitle,
        candidateSector: s.candidateSector,
        candidateSeniority: s.candidateSeniority,
        candidateSalaryUsd: s.candidateSalaryUsd,
      }))}
      interviews={interviews.map((i) => ({
        id: i.id,
        shortlistId: i.shortlistId,
        kind: i.kind,
        scheduledFor: i.scheduledFor,
        outcome: i.outcome,
        note: i.note,
      }))}
      placements={placements.map((p) => ({
        id: p.id,
        candidateId: p.candidateId,
        candidateName: p.candidateName,
        acceptedOn: p.acceptedOn,
        startedOn: p.startedOn,
        monthlyGrossUsd: p.monthlyGrossUsd,
        endedOn: p.endedOn,
        endedReason: p.endedReason,
        fault: p.fault,
        notes: p.notes,
        checkIns: p.checkIns.map((c) => ({
          id: c.id, day: c.day, party: c.party, spokeOn: c.spokeOn, note: c.note,
        })),
      }))}
      pool={pool.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        sector: c.sector,
        seniority: c.seniority,
        expectedSalaryUsd: c.expectedSalaryUsd,
      }))}
    />
  );
}
