// One candidate.

import { notFound } from "next/navigation";
import { getCandidate } from "@/lib/recruitment";
import { RecruitmentCandidateRecord } from "@/components/recruitment-candidate-record";

export const dynamic = "force-dynamic";
export const metadata = { title: "Candidate — Recruitment" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const c = await getCandidate(n);
  if (!c) notFound();

  return (
    <RecruitmentCandidateRecord
      candidate={{
        id: c.id,
        name: c.name,
        title: c.title,
        sector: c.sector,
        origin: c.origin,
        yearsExp: c.yearsExp,
        seniority: c.seniority,
        expectedSalaryUsd: c.expectedSalaryUsd,
        email: c.email,
        phone: c.phone,
        passportNo: c.passportNo,
        passportExpiry: c.passportExpiry,
        ecnr: c.ecnr,
        idVerified: c.idVerified,
        partnerName: c.partnerName,
        consentSignedOn: c.consentSignedOn,
        engagementSignedOn: c.engagementSignedOn,
        notes: c.notes,
        archived: c.archived,
      }}
    />
  );
}
