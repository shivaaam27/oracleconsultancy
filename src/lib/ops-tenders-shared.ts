// ─────────────────────────────────────────────────────────────────────────────
// TENDERS — the client-safe half (Stage 7).
//
// ⚠️ No `sb` import. The server half is `ops-tenders.ts`.
//
// The workbook's `tenders` sheet: 80 rows, four columns — description, type of
// quote, deadline, client. It sits BEFORE the funnel. A tender is advertised,
// we decide whether to bid, and only if it comes off does an enquiry or an
// order follow.
//
// ⚠️ Deliberately NOT part of the conversion figures. Those are about enquiries
// a client actually sent us; folding bids into them would change what the win
// rate means.
// ─────────────────────────────────────────────────────────────────────────────

import { day } from "@/lib/ops-orders-shared";

export type Tender = {
  id: number;
  companyId: number;
  description: string;
  client: string | null;
  quoteType: string | null;
  deadline: string | null;
  outcome: string | null;
  outcomeReason: string | null;
  submittedDate: string | null;
  enquiryId: number | null;
  notes: string | null;
  archived: boolean;
};

const DAY_MS = 86_400_000;

export type TenderView = {
  tender: Tender;
  /** Days until the deadline. Negative = it has passed. Null with no deadline. */
  daysLeft: number | null;
  submitted: boolean;
  /** Closed with an outcome — won, lost or not bid. */
  closed: boolean;
  /** Still live and still biddable. */
  open: boolean;
  /** ⚠️ Live, and the deadline has gone. The one thing this screen exists to
   *  catch: a bid nobody submitted and nobody closed. */
  missed: boolean;
  waitingOn: string | null;
};

export function tenderView(t: Tender, today: Date = new Date()): TenderView {
  const now = day(today)!;
  const due = day(t.deadline);
  const daysLeft = due === null ? null : Math.round((due.getTime() - now.getTime()) / DAY_MS);

  const submitted = Boolean(t.submittedDate);
  const closed = Boolean(t.outcome?.trim());
  const open = !closed;
  const missed = open && !submitted && daysLeft !== null && daysLeft < 0;

  let waitingOn: string | null = null;
  if (missed) waitingOn = "deadline passed, nothing submitted";
  else if (open && !submitted) waitingOn = daysLeft === null ? "no deadline set" : "not submitted yet";
  else if (open && submitted) waitingOn = "waiting on the client";

  return { tender: t, daysLeft, submitted, closed, open, missed, waitingOn };
}

export type TenderTotals = {
  tenders: number;
  open: number;
  submitted: number;
  won: number;
  missed: number;
  /** Live bids due in the next week — what to look at this morning. */
  dueSoon: number;
};

export function tenderTotals(views: TenderView[]): TenderTotals {
  let open = 0, submitted = 0, won = 0, missed = 0, dueSoon = 0;
  for (const v of views) {
    if (v.open) open += 1;
    if (v.submitted) submitted += 1;
    if ((v.tender.outcome ?? "").trim().toUpperCase() === "WON") won += 1;
    if (v.missed) missed += 1;
    if (v.open && v.daysLeft !== null && v.daysLeft >= 0 && v.daysLeft <= 7) dueSoon += 1;
  }
  return { tenders: views.length, open, submitted, won, missed, dueSoon };
}

/** What to offer when closing one. Free text — these only suggest. */
export const TENDER_OUTCOMES = ["SUBMITTED", "WON", "LOST", "NOT BID", "CANCELLED"];
export const TENDER_TYPES = ["QUOTE", "EOI", "PREQUALIFICATION", "RFP"];
