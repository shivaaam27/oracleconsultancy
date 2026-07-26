// Intake-accuracy metrics ("watch the brain get smarter"). Pulls together the
// signals the document brain already leaves behind — extraction diagnostics
// (system_events 'doc-extraction'), fact contradictions ('fact-discrepancy'),
// the learned-owner / learned-category memories (owner_corrections /
// routing_corrections), the self-moving reactions (automation_events) and where
// documents actually landed (documents.intake_state / review_status) — into one
// honest read of how the intake is doing this period vs the period before.
//
// Read-only and entirely best-effort: a query failure returns zeros for that
// slice, never throws, so the dashboard degrades quietly rather than breaking
// the /inbox page.

import { sb } from "@/db/supabase";

export type IntakeWindow = {
  /** Documents that ended up filed this period, however they got there. */
  filed: number;
  /** Of those, the ones a HUMAN confirmed (vetted_at stamped). Not automation. */
  filedByYou: number;
  /** Documents held for a glance (intake_state = quarantine). */
  quarantined: number;
  /** Filed documents the system flagged for a human check (review_status). */
  needsReview: number;
  /** Total documents that arrived this period. */
  documents: number;
  /** AI reads recorded this period (system_events 'doc-extraction'). */
  reads: number;
  /** Reads that came back clean (status ok). */
  readsClean: number;
  /** Times the owner taught it an owner/category (owner_ + routing_corrections). */
  corrections: number;
  /** Contradictions the fact ledger flagged ('fact-discrepancy'). */
  discrepancies: number;
  /** Moves the automation layer applied on its own (automation_events applied). */
  autoMoves: number;
};

export type IntakeMetrics = {
  /** The window length in days. */
  days: number;
  /** This period's figures. */
  now: IntakeWindow;
  /** The immediately preceding period of the same length, for the trend. */
  prev: IntakeWindow;
  /**
   * Headline auto-file success: of the documents that arrived this period, the
   * share the system placed WITHOUT you — filed, not confirmed by your hand, and
   * not flagged for review. 0–100. Null when nothing arrived.
   */
  autoFileRate: number | null;
  /** The same rate for the previous period, for the up/down arrow. Null if none. */
  prevAutoFileRate: number | null;
  /** Documents that needed no human at all — filed, not vetted by you, not flagged. */
  cleanFiled: number;
  /** Documents that took your time — held, flagged, or filed by your own hand. */
  neededYou: number;
};

const ZERO: IntakeWindow = {
  filed: 0, filedByYou: 0, quarantined: 0, needsReview: 0, documents: 0,
  reads: 0, readsClean: 0, corrections: 0, discrepancies: 0, autoMoves: 0,
};

/**
 * Count documents that arrived in [from, to), optionally narrowed by intake
 * bucket and/or review status. Best-effort — returns 0 on any failure.
 *
 * IMPORTANT: do NOT filter on `archived` here. Quarantine and trash rows are
 * stored with archived=true (see setIntakeState in documents.ts), so an
 * `archived=false` filter would make the "quarantined" slice ALWAYS read 0 and
 * would drop quarantined docs out of the arrivals denominator — overstating the
 * auto-file rate and undercounting "needed you". We narrow strictly by the real
 * `intake_state` instead, which is the honest source for each bucket.
 */
async function countDocs(
  fromIso: string,
  toIso: string,
  opts: { intakeState?: string; reviewStatus?: string; vetted?: boolean } = {},
): Promise<number> {
  try {
    let q = sb
      .from("documents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (opts.intakeState) q = q.eq("intake_state", opts.intakeState);
    if (opts.reviewStatus) q = q.eq("review_status", opts.reviewStatus);
    // vetted_at is stamped by EVERY human confirm path (fileFromQuarantine, the
    // bulk confirms, the sort desk) and by none of the automatic ones — so it is
    // the honest divider between "the system filed this" and "you filed this".
    if (opts.vetted === true) q = q.not("vetted_at", "is", null);
    if (opts.vetted === false) q = q.is("vetted_at", null);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Count system_events of a kind in [from, to). Optionally only status "ok". */
async function countEvents(kind: string, fromIso: string, toIso: string, onlyOk = false): Promise<number> {
  try {
    let q = sb
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", kind)
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (onlyOk) q = q.eq("status", "ok");
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Count learned corrections (owner + category) touched in [from, to). A bumped
 *  `hits` updates `updated_at`, so we look at the most recent of created/updated. */
async function countCorrections(fromIso: string, toIso: string): Promise<number> {
  let total = 0;
  for (const table of ["owner_corrections", "routing_corrections"] as const) {
    try {
      // created in window …
      const { count: created } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lt("created_at", toIso);
      // … plus rows re-taught (updated) in window but created earlier, so a repeat
      // lesson still counts as the owner correcting it this period.
      const { count: updated } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .lt("created_at", fromIso)
        .gte("updated_at", fromIso)
        .lt("updated_at", toIso);
      total += (created ?? 0) + (updated ?? 0);
    } catch {
      /* skip this table */
    }
  }
  return total;
}

/** Automation moves the system APPLIED on its own (not suggested) in [from, to). */
async function countAutoMoves(fromIso: string, toIso: string): Promise<number> {
  try {
    const { count } = await sb
      .from("automation_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied")
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Compute one window's figures. Each slice is independently guarded. */
async function computeWindow(fromIso: string, toIso: string): Promise<IntakeWindow> {
  try {
    const [
      filed, filedByYou, quarantined, needsReview,
      reads, readsClean, corrections, discrepancies, autoMoves,
    ] = await Promise.all([
      countDocs(fromIso, toIso, { intakeState: "filed" }),
      countDocs(fromIso, toIso, { intakeState: "filed", vetted: true }),
      countDocs(fromIso, toIso, { intakeState: "quarantine" }),
      countDocs(fromIso, toIso, { intakeState: "filed", reviewStatus: "needs_review" }),
      countEvents("doc-extraction", fromIso, toIso),
      countEvents("doc-extraction", fromIso, toIso, true),
      countCorrections(fromIso, toIso),
      countEvents("fact-discrepancy", fromIso, toIso),
      countAutoMoves(fromIso, toIso),
    ]);
    // Arrivals that needed a decision = filed + quarantined. Trash (certain
    // duplicates the brain auto-removed) is deliberately EXCLUDED from the
    // denominator so successful de-duplication doesn't drag the rate down.
    const documents = filed + quarantined;
    return { documents, filed, filedByYou, quarantined, needsReview, reads, readsClean, corrections, discrepancies, autoMoves };
  } catch {
    return { ...ZERO };
  }
}

/**
 * Auto-file success as a percentage: of the documents that arrived in a window,
 * the share that filed cleanly on their own (filed AND not flagged for review).
 * Null when nothing arrived — there's no honest rate to show for an empty period.
 */
function rate(w: IntakeWindow): number | null {
  if (w.documents <= 0) return null;
  // "Auto-filed" must mean the system did it WITHOUT you. Subtracting the
  // human-confirmed ones matters: for three weeks from 5 Jul the intake filed
  // nothing on its own, yet this read 62% — because a document you confirmed by
  // hand ends in the same `filed` state as one the system placed, and the rate
  // could not tell them apart. It was measuring how much work YOU had done and
  // calling it automation.
  const clean = Math.max(0, w.filed - w.filedByYou - w.needsReview);
  return Math.round((clean / w.documents) * 100);
}

/**
 * The intake-accuracy snapshot for the last `days` days vs the period before.
 * Best-effort and read-only — never throws; on total failure returns all-zeros so
 * the dashboard renders a calm "nothing yet" rather than an error.
 */
export async function computeIntakeMetrics(days = 30): Promise<IntakeMetrics> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;
  const dayMs = 86_400_000;
  const now = new Date();
  const nowIso = now.toISOString();
  const startIso = new Date(now.getTime() - safeDays * dayMs).toISOString();
  const prevStartIso = new Date(now.getTime() - 2 * safeDays * dayMs).toISOString();

  try {
    const [cur, prev] = await Promise.all([
      computeWindow(startIso, nowIso),
      computeWindow(prevStartIso, startIso),
    ]);
    return {
      days: safeDays,
      now: cur,
      prev,
      autoFileRate: rate(cur),
      prevAutoFileRate: rate(prev),
      cleanFiled: Math.max(0, cur.filed - cur.filedByYou - cur.needsReview),
      neededYou: cur.quarantined + cur.needsReview + cur.filedByYou,
    };
  } catch {
    return {
      days: safeDays,
      now: { ...ZERO },
      prev: { ...ZERO },
      autoFileRate: null,
      prevAutoFileRate: null,
      cleanFiled: 0,
      neededYou: 0,
    };
  }
}
