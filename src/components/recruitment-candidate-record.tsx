"use client";

// One candidate. Thin client wrapper — it holds the server actions.

import { AlertTriangle } from "lucide-react";
import { RecruitmentRecord } from "./recruitment-record";
import { CANDIDATE_FORM } from "@/lib/recruitment-fields";
import { toCandidatePatch, candidateFormValues } from "./recruitment-candidates-list";
import { updateCandidateAction, archiveCandidateAction, deleteCandidateAction } from "@/app/recruitment/actions";
import { DangerZone } from "./recruitment-danger-zone";
import {
  passportState, candidatePapersMissing, seniorityLabel, fmtDate,
} from "@/lib/recruitment-shared";
import { usd, feeFor, tzsFull } from "@/lib/recruitment-money";

export type CandidateRecordData = {
  id: number;
  name: string;
  title: string | null;
  sector: string | null;
  origin: string;
  yearsExp: number | null;
  seniority: string | null;
  expectedSalaryUsd: string | null;
  email: string | null;
  phone: string | null;
  passportNo: string | null;
  passportExpiry: string | null;
  ecnr: boolean;
  idVerified: boolean;
  partnerName: string | null;
  consentSignedOn: string | null;
  engagementSignedOn: string | null;
  notes: string | null;
  archived: boolean;
};

export function RecruitmentCandidateRecord({ candidate }: { candidate: CandidateRecordData }) {
  const missing = candidatePapersMissing(candidate);
  const passport = passportState(candidate.passportExpiry);
  const fee = feeFor(candidate.expectedSalaryUsd);

  return (
    <RecruitmentRecord
      title={candidate.name}
      subtitle={[candidate.title, candidate.sector, seniorityLabel(candidate.seniority)]
        .filter((x) => x && x !== "—").join(" · ") || undefined}
      status={candidate.archived ? "Archived" : undefined}
      backHref="/recruitment/candidates"
      backLabel="All candidates"
      groups={CANDIDATE_FORM}
      values={candidateFormValues(candidate)}
      archived={candidate.archived}
      onSave={(v) => updateCandidateAction(candidate.id, toCandidatePatch(v))}
      onArchive={(a) => archiveCandidateAction(candidate.id, a)}
      banner={
        missing.includes("Registration & Consent") ? (
          <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/50 px-3 py-2 text-[12px] text-fg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>
              <strong>Registration &amp; Consent is not signed.</strong> Without it there is no
              lawful basis for holding this person&rsquo;s details at all.
            </span>
          </p>
        ) : null
      }
      sidebar={
        <div className="space-y-3">
          <Panel title="If placed">
            {/* Shown so the value of a candidate is legible at a glance — it is
                NOT a quote, and nothing is owed until a client accepts an offer
                on a job order. */}
            <Row label="Expected gross" value={candidate.expectedSalaryUsd ? usd(Number(candidate.expectedSalaryUsd)) : "Not recorded"} />
            <Row label="Fee would be" value={fee ? tzsFull(fee.netTZS) : "—"} />
            <p className="pt-1 text-[11px] text-fg-subtle">
              One month of gross, plus 18% VAT. Indicative until a job order agrees the salary.
            </p>
          </Panel>
          <Panel title="Checks">
            <Row
              label="Passport"
              value={passport === "none" ? "Not recorded" : passport === "expired" ? "Expired" : passport === "tooSoon" ? "Under 6 months" : "OK"}
              bad={passport === "expired" || passport === "tooSoon"}
            />
            <Row label="Identity checked" value={candidate.idVerified ? "Yes" : "No"} bad={!candidate.idVerified} />
            <Row label="ECNR" value={candidate.ecnr ? "Yes" : "No"} />
          </Panel>
          <Panel title="Papers">
            <Row label="Registration & Consent" value={fmtDate(candidate.consentSignedOn) ?? "Not signed"} bad={!candidate.consentSignedOn} />
            <Row label="Terms of Engagement" value={fmtDate(candidate.engagementSignedOn) ?? "Not signed"} bad={!candidate.engagementSignedOn} />
          </Panel>
          <p className="px-1 text-[11px] text-fg-subtle">
            This candidate pays Oracle nothing, in any circumstance. There is nowhere on this
            record to say otherwise, and that is deliberate.
          </p>
          <DangerZone
            what="candidate"
            name={candidate.name}
            onDelete={() => deleteCandidateAction(candidate.id)}
            backHref="/recruitment/candidates"
          />
        </div>
      }
    />
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <div className="border-b border-border bg-bg-subtle px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className={bad ? "text-[12px] font-medium text-warn" : "text-[12px] tabular"}>{value}</span>
    </div>
  );
}
