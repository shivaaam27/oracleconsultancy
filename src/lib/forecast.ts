import { sb } from "@/db/supabase";
import { listLeaveTypes } from "@/lib/leave";
import { listObligations } from "@/lib/recurring";
import { deriveDocStatus, type DocumentRow } from "@/lib/documents";

/* ------------------------------------------------------------------ */
/* Predictive Insights (Phase 4) — forward-looking signals for         */
/* /insights. Read-only, AI-free, reuses existing libs. Nothing here    */
/* mutates: it answers "what's coming" so the owner can act early.      */
/* ------------------------------------------------------------------ */

const DAY = 86400000;

function daysUntil(d: Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

/** Annual-leave liability: days the portfolio still owes its staff this cycle. */
export type LeaveLiability = {
  typeName: string;
  staffCount: number;
  entitlement: number;
  totalEntitled: number;
  taken: number;
  outstanding: number;
} | null;

/** A document that is still valid today but expires within the horizon. */
export type ComplianceDecayItem = {
  documentId: number;
  title: string;
  companyName: string | null;
  expiryDate: string;
  daysLeft: number;
};

/** An upcoming recurring obligation, soonest first. */
export type RenewalRadarItem = {
  id: number;
  label: string;
  category: string;
  dueDate: string;
  daysLeft: number;
};

/** A person whose probation window is closing soon (decision needed). */
export type ProbationDeadline = {
  personId: number;
  name: string;
  date: string;
  daysLeft: number;
};

export type InsightForecast = {
  leaveLiability: LeaveLiability;
  complianceDecay: { items: ComplianceDecayItem[]; horizonDays: number };
  renewals: RenewalRadarItem[];
  probation: ProbationDeadline[];
};

const STAFF_TYPES = ["local_staff", "expat"];
const COMPLIANCE_HORIZON_DAYS = 30; // docs expiring before roughly the next monthly brief
const RENEWAL_HORIZON_DAYS = 60;
const PROBATION_HORIZON_DAYS = 30;

async function getLeaveLiability(): Promise<LeaveLiability> {
  const types = await listLeaveTypes();
  // The paid annual entitlement (ELR Act: 28 days / 12 months).
  const annual = types.find((t) => /annual/i.test(t.name) && t.defaultDays > 0) ?? null;
  if (!annual) return null;

  const [{ count: staffCount }, { data: reqs }] = await Promise.all([
    sb.from("people").select("id", { count: "exact", head: true }).eq("active", true).in("person_type", STAFF_TYPES),
    sb.from("leave_requests").select("days,status,start_date").eq("leave_type_id", annual.id),
  ]);

  const cycleStart = new Date();
  cycleStart.setUTCMonth(cycleStart.getUTCMonth() - annual.cycleMonths);
  const taken = (reqs ?? [])
    .filter((r) => r.status === "Approved" && new Date(r.start_date as string) >= cycleStart)
    .reduce((s, r) => s + ((r.days as number) ?? 0), 0);

  const staff = staffCount ?? 0;
  const totalEntitled = staff * annual.defaultDays;
  return {
    typeName: annual.name,
    staffCount: staff,
    entitlement: annual.defaultDays,
    totalEntitled,
    taken,
    outstanding: Math.max(0, totalEntitled - taken),
  };
}

function getComplianceDecay(documents: DocumentRow[]): ComplianceDecayItem[] {
  return documents
    .filter((d) => deriveDocStatus(d) !== "Expired" && d.expiryDate)
    .map((d) => ({ d, daysLeft: daysUntil(d.expiryDate as Date) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= COMPLIANCE_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ d, daysLeft }) => ({
      documentId: d.id,
      title: d.title,
      companyName: null, // filled by the caller (which has the company map)
      expiryDate: (d.expiryDate as Date).toISOString(),
      daysLeft,
    }));
}

async function getRenewals(): Promise<RenewalRadarItem[]> {
  const obligations = await listObligations();
  return obligations
    .filter((o) => o.nextDue)
    .map((o) => ({ o, daysLeft: daysUntil(o.nextDue as Date) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= RENEWAL_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ o, daysLeft }) => ({
      id: o.id,
      label: o.label,
      category: o.category,
      dueDate: (o.nextDue as Date).toISOString(),
      daysLeft,
    }));
}

async function getProbationDeadlines(): Promise<ProbationDeadline[]> {
  const { data } = await sb
    .from("people")
    .select("id,name,probation_end_date")
    .eq("active", true)
    .in("person_type", STAFF_TYPES)
    .not("probation_end_date", "is", null);
  return (data ?? [])
    .map((p) => ({ p, daysLeft: daysUntil(new Date(p.probation_end_date as string)) }))
    // Include the days just past (decision overdue) through the horizon.
    .filter((x) => x.daysLeft >= -7 && x.daysLeft <= PROBATION_HORIZON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ p, daysLeft }) => ({
      personId: p.id as number,
      name: p.name as string,
      date: new Date(p.probation_end_date as string).toISOString(),
      daysLeft,
    }));
}

/** Build every forward-looking signal for /insights in one pass. */
export async function gatherInsightForecast(
  documents: DocumentRow[],
  companyNameById: Map<number, string>,
): Promise<InsightForecast> {
  const [leaveLiability, renewals, probation] = await Promise.all([
    getLeaveLiability(),
    getRenewals(),
    getProbationDeadlines(),
  ]);

  const decay = getComplianceDecay(documents).map((item) => {
    const doc = documents.find((d) => d.id === item.documentId);
    return { ...item, companyName: doc?.companyId ? companyNameById.get(doc.companyId) ?? null : null };
  });

  return {
    leaveLiability,
    complianceDecay: { items: decay, horizonDays: COMPLIANCE_HORIZON_DAYS },
    renewals,
    probation,
  };
}
