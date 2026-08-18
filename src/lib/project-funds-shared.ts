// ─────────────────────────────────────────────────────────────────────────────
// FUNDS ANALYSIS — money by batch (the workbook's FUNDS ANALYSIS sheet).
//
// Requisitions are raised in BATCHES — PT-01, PT-02, PT-03 — and this is the
// sheet that answers "how much of the budget is left?". One row per batch:
//
//   C  amount requested      SUMIF(REQUISITIONS!G, batch, REQUISITIONS!J)
//   D  amount approved       SUMIF(REQUISITIONS!G, batch, REQUISITIONS!Q)
//   F  balance               C − D   (what head office trimmed)
//   J  actual expenditure    SUMIF(REQUISITIONS!G, batch, REQUISITIONS!X)
//   K  (over)/under spent    D − J
//   L  cumulative balance    running total of K
//   M  DIMINISHING BUDGET    previous M − D
//   N  funds utilisation     (budget − M) / budget
//
// ⚠️ Column M is the best single number in the whole workbook: the budget
// counting DOWN as approvals eat into it. On the real data it had fallen from
// 146,801,556 to 52,689,606 — 64% gone. Nothing else on the dashboard says that
// as plainly, which is why this screen is worth rebuilding rather than folding
// into the Snapshot.
//
// Client-safe: pure arithmetic, no database.
// ─────────────────────────────────────────────────────────────────────────────

import { num } from "@/lib/projects-shared";

export type BatchInput = {
  batchNo: string | null;
  amountRequested: string;
  amountApproved: string | null;
  amountReceived: string | null;
  requestedDate: string | null;
  status: string;
};

export type BatchRow = {
  batchNo: string;
  /** Earliest request in the batch — the workbook's column A. */
  firstDate: string | null;
  requests: number;
  requested: number;
  approved: number;
  /**
   * What head office CUT — requested minus approved, counting only requests
   * somebody has actually decided on.
   *
   * ⚠️ NOT simply `requested − approved`. A request nobody has looked at has an
   * approved figure of null, so the naive sum reports the whole amount as
   * "trimmed" — the demo showed a pending 500,000 batch as though head office
   * had refused every shilling of it. Undecided is not refused.
   */
  trimmed: number;
  /** Confirmed received against this batch. */
  actual: number;
  /** approved − actual. Positive = approved money not yet turned into goods. */
  underSpent: number;
  /** Running total of `underSpent` down the sheet. */
  cumulative: number;
  /** The budget counting down: previous − approved. */
  diminishing: number | null;
  /** How much of the budget has been consumed by approvals, as a fraction. */
  utilisation: number | null;
  /** Asked for but not yet decided on — neither approved nor refused. */
  pending: number;
  /** Nothing in this batch has been approved yet. */
  awaitingApproval: boolean;
};

export type FundsSummary = {
  rows: BatchRow[];
  totals: {
    requested: number;
    approved: number;
    trimmed: number;
    /** Asked for and still undecided — neither approved nor refused. */
    pending: number;
    actual: number;
    /** What is left of the budget after every approval. */
    remaining: number | null;
    utilisation: number | null;
  };
};

/**
 * Group requisitions into batches and walk the running figures down.
 *
 * `budget` is the bill-of-quantities total. When it is null (no budget entered
 * yet) the diminishing column and utilisation are null rather than 0 — the usual
 * rule: an unknown must not render as a number.
 *
 * ⚠️ Rejected and cancelled requests are left out entirely. The workbook has no
 * notion of either, so its batch totals silently include money that was refused.
 */
export function fundsByBatch(
  requisitions: BatchInput[],
  budget: number | null,
): FundsSummary {
  const groups = new Map<string, BatchInput[]>();
  for (const r of requisitions) {
    if (r.status === "Rejected" || r.status === "Cancelled") continue;
    // A request with no batch still has to appear somewhere, or the totals on
    // this screen would quietly disagree with the Requisitions tab.
    const key = (r.batchNo ?? "").trim() || "(no batch)";
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  // Oldest first: the running balance and the diminishing budget only mean
  // anything read top to bottom, in the order the money was committed.
  const keys = [...groups.keys()].sort((a, b) => {
    const ad = earliest(groups.get(a)!) ?? "9999";
    const bd = earliest(groups.get(b)!) ?? "9999";
    return ad === bd ? a.localeCompare(b) : ad < bd ? -1 : 1;
  });

  let cumulative = 0;
  let diminishing = budget;
  const rows: BatchRow[] = [];

  for (const batchNo of keys) {
    const items = groups.get(batchNo)!;
    let requested = 0, approved = 0, actual = 0, unapproved = 0;
    // Only requests with a decision on them can have been trimmed.
    let decidedRequested = 0;
    for (const r of items) {
      const asked = num(r.amountRequested) ?? 0;
      requested += asked;
      const a = num(r.amountApproved);
      if (a === null) unapproved += 1;
      else { approved += a; decidedRequested += asked; }
      actual += num(r.amountReceived) ?? 0;
    }
    const underSpent = approved - actual;
    cumulative += underSpent;
    if (diminishing !== null) diminishing -= approved;

    rows.push({
      batchNo,
      firstDate: earliest(items),
      requests: items.length,
      requested,
      approved,
      trimmed: decidedRequested - approved,
      pending: requested - decidedRequested,
      actual,
      underSpent,
      cumulative,
      diminishing,
      utilisation: budget && budget > 0 && diminishing !== null
        ? (budget - diminishing) / budget
        : null,
      awaitingApproval: unapproved === items.length,
    });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      requested: acc.requested + r.requested,
      approved: acc.approved + r.approved,
      trimmed: acc.trimmed + r.trimmed,
      pending: acc.pending + r.pending,
      actual: acc.actual + r.actual,
    }),
    { requested: 0, approved: 0, trimmed: 0, pending: 0, actual: 0 },
  );

  return {
    rows,
    totals: {
      ...totals,
      remaining: budget === null ? null : budget - totals.approved,
      utilisation: budget && budget > 0 ? totals.approved / budget : null,
    },
  };
}

function earliest(items: BatchInput[]): string | null {
  const dates = items.map((i) => i.requestedDate).filter((d): d is string => Boolean(d));
  return dates.length ? dates.sort()[0] : null;
}
