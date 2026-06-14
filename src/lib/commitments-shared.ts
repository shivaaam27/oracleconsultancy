// commitments-shared.ts — client-safe types + the notice-by maths for the
// commitments register (leases / insurance / commercial contracts).

export type CommitmentKind = "lease" | "insurance" | "contract";

export const KIND_LABEL: Record<CommitmentKind, string> = {
  lease: "Lease",
  insurance: "Insurance",
  contract: "Contract",
};

export type Commitment = {
  id: number;
  kind: CommitmentKind;
  companyId: number | null;
  companyName: string | null;
  title: string;
  counterparty: string | null;
  reference: string | null;
  startDate: string | null;
  endDate: string | null;
  noticeDays: number | null;
  amount: string | null;
  status: string;
  note: string | null;
};

const DAY = 86400 * 1000;
const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** The date by which notice must be given = end_date − notice_days. Null if unknown. */
export function noticeByDate(c: Pick<Commitment, "endDate" | "noticeDays">): Date | null {
  if (!c.endDate) return null;
  const end = new Date(c.endDate);
  if (c.noticeDays && c.noticeDays > 0) return new Date(end.getTime() - c.noticeDays * DAY);
  return end; // no notice period → the end date itself is the deadline
}

/** Whole days until the notice-by date (negative = the window has passed). */
export function daysToNotice(c: Pick<Commitment, "endDate" | "noticeDays">, asOf: Date = new Date()): number | null {
  const nb = noticeByDate(c);
  if (!nb) return null;
  return Math.floor((midnight(nb).getTime() - midnight(asOf).getTime()) / DAY);
}

export type CommitmentUrgency = "overdue" | "soon" | "ok" | "undated";

/** Urgency from the notice window: overdue, soon (≤30d), ok, or undated. */
export function commitmentUrgency(c: Pick<Commitment, "endDate" | "noticeDays" | "status">): CommitmentUrgency {
  const d = daysToNotice(c);
  if (d === null) return "undated";
  if (d < 0) return "overdue";
  if (d <= 30) return "soon";
  return "ok";
}

export const URGENCY_TONE: Record<CommitmentUrgency, "danger" | "warn" | "success" | "muted"> = {
  overdue: "danger",
  soon: "warn",
  ok: "success",
  undated: "muted",
};
