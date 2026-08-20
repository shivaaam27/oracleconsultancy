// ─────────────────────────────────────────────────────────────────────────────
// THE RECRUITMENT DESK — the client-safe half (Phase 1).
//
// Vocabularies and pure arithmetic. Every screen, on both sides of the app,
// reads its stages and its derived figures from here.
//
// ⚠️ CLIENT-SAFE, and it must stay that way. The server half is `recruitment.ts`
// and it imports `sb` (the service-role Supabase client) — a client component
// that value-imports THAT file drags the service key into the browser bundle and
// every page dies with "SUPABASE_SERVICE_ROLE_KEY is not set". The split is a
// hard rule in CLAUDE.md and it has been broken before.
//
// ⚠️ NOTHING DERIVED IS STORED. No fee column, no progress column, no days
// count. They are worked out on read, here, so none of them can go stale — the
// same rule the ops module and the ledger follow.
// ─────────────────────────────────────────────────────────────────────────────

import { feeFor, GUARANTEE_MONTHS, CHECK_IN_DAYS, type Fee } from "@/lib/recruitment-money";

const EAT = "Africa/Dar_es_Salaam";

/* ───────────────────────────────────────────────────────────── vocabulary ── */

/**
 * Where a job order has reached. ORDERED — the index doubles as progress, which
 * is why nothing may be inserted in the middle without thinking about it.
 *
 * "Permit stage" is here even though ORACLE DOES NOT TOUCH PERMITS: it is the
 * client's own process, and the order genuinely sits there while it happens.
 * Naming the wait is not the same as doing the work.
 */
export const JOB_STAGES = [
  "Sourcing",
  "Shortlist with client",
  "Client interviewing",
  "Offer accepted",
  "Permit stage",
  "Placed",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

/** Closed states a job order can end in without a placement. */
export const JOB_CLOSED_STAGES = ["Placed"] as const;

/** How far along, 0–1. Used for the progress figure on the list. */
export function stageProgress(stage: string): number {
  const i = (JOB_STAGES as readonly string[]).indexOf(stage);
  if (i < 0) return 0;
  return i / (JOB_STAGES.length - 1);
}

/** Open means anything that has not been placed — the same shape as tasks. */
export function isOpenOrder(stage: string, archived = false): boolean {
  return !archived && stage !== "Placed";
}

export const SENIORITIES = ["junior", "mid", "senior", "exec"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  exec: "Executive",
};

export function seniorityLabel(v: string | null | undefined): string {
  return v && v in SENIORITY_LABELS ? SENIORITY_LABELS[v as Seniority] : "—";
}

/** Where a candidate comes from. India only today; the field exists so a local
 *  hire is representable without a migration. */
export const ORIGINS = ["india", "local"] as const;
export const ORIGIN_LABELS: Record<string, string> = { india: "India", local: "Tanzania" };

/**
 * Why a candidate came off a shortlist.
 *
 * ⚠️ The wording maps onto the fault buckets in Terms of Business clause 6, so
 * that when a placement is disputed the reason is already recorded in the
 * vocabulary the contract uses. Do not "tidy" these into friendlier words.
 */
export const DECLINE_REASONS = [
  "Skills below requirement",
  "Salary expectation too high",
  "Candidate withdrew",
  "Client cancelled the role",
  "Client chose another candidate",
  "Permit or document problem",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

/* ─────────────────────────────────────────────────────────────── the fee ── */

/** The fee on one job order. Null until the salary is agreed. */
export function orderFee(monthlyGrossUSD: number | string | null | undefined): Fee | null {
  return feeFor(monthlyGrossUSD);
}

/* ─────────────────────────────────────────────────────────── the papers ─── */

/**
 * Which client papers are missing.
 *
 * The Terms of Business is signed ONCE PER CLIENT and the profile is explicit:
 * *"We do not begin sourcing before it is signed."* The Data Sharing Agreement
 * is what makes it lawful to send that client a candidate's details at all.
 */
export function clientPapersMissing(c: {
  termsSignedOn?: string | null;
  dsaSignedOn?: string | null;
}): string[] {
  const out: string[] = [];
  if (!c.termsSignedOn) out.push("Terms of Business");
  if (!c.dsaSignedOn) out.push("Data Sharing Agreement");
  return out;
}

/**
 * Which candidate papers are missing.
 *
 * Registration & Consent and the Terms of Engagement are both signed once, at
 * registration. Without the consent there is no lawful basis for holding the
 * person's CV, which is why it is checked here rather than remembered.
 */
export function candidatePapersMissing(c: {
  consentSignedOn?: string | null;
  engagementSignedOn?: string | null;
}): string[] {
  const out: string[] = [];
  if (!c.consentSignedOn) out.push("Registration & Consent");
  if (!c.engagementSignedOn) out.push("Terms of Engagement");
  return out;
}

/* ────────────────────────────────────────────────────────────── passport ── */

/** Months of passport validity a placement needs beyond the start date. */
export const PASSPORT_MIN_MONTHS = 6;

export type PassportState = "none" | "expired" | "tooSoon" | "ok";

/**
 * A passport has to outlive the start date by six months. Checked rather than
 * remembered, because it is the sort of thing that is fine when the candidate is
 * sourced and a crisis three months later at the offer.
 */
export function passportState(expiry: string | null | undefined, today = new Date()): PassportState {
  if (!expiry) return "none";
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return "none";
  if (d.getTime() < today.getTime()) return "expired";
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() + PASSPORT_MIN_MONTHS);
  return d.getTime() < limit.getTime() ? "tooSoon" : "ok";
}

export const PASSPORT_TONE: Record<PassportState, "danger" | "warn" | "success" | "muted"> = {
  expired: "danger",
  tooSoon: "warn",
  ok: "success",
  none: "muted",
};

/* ──────────────────────────────────────────────────────────── references ── */

/**
 * A job order's reference — `JO-2608-04`: the year, the month, and the fourth
 * order raised that month. It is what everyone says out loud, so it is short and
 * it is spoken in the order the information arrives.
 *
 * ⚠️ The NUMBER is allocated by the write core against what is already in the
 * database (`recruitment.ts`), never here. This only formats.
 */
export function jobOrderRef(opened: Date, sequence: number): string {
  const yy = String(opened.getUTCFullYear()).slice(2);
  const mm = String(opened.getUTCMonth() + 1).padStart(2, "0");
  return `JO-${yy}${mm}-${String(sequence).padStart(2, "0")}`;
}

/** The `JO-2608-` half of a reference, for finding the month's existing orders. */
export function jobOrderRefPrefix(opened: Date): string {
  const yy = String(opened.getUTCFullYear()).slice(2);
  const mm = String(opened.getUTCMonth() + 1).padStart(2, "0");
  return `JO-${yy}${mm}-`;
}

/** The sequence out of a reference, or 0 if it is not one of ours. */
export function jobOrderRefSequence(ref: string): number {
  const m = /^JO-\d{4}-(\d+)$/.exec(ref.trim());
  return m ? Number(m[1]) : 0;
}

/* ─────────────────────────────────────────────────────────────── dates ───── */

/** A date as "19 May 2026", read in Dar es Salaam. */
export function fmtDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: EAT,
  });
}

/** Whole days from `from` to `to`. Negative means `to` has passed. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** An ISO date plus a number of days, back as an ISO date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * When the free-replacement guarantee runs out: one month from the start date.
 *
 * Calendar months, not 30 days — the Terms say "within one month of starting"
 * and a person reading that means the same date next month.
 */
export function guaranteeEnds(placedOn: string): string {
  const d = new Date(placedOn.length === 10 ? placedOn + "T00:00:00Z" : placedOn);
  d.setUTCMonth(d.getUTCMonth() + GUARANTEE_MONTHS);
  return d.toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════ PHASE 2 — end to end ══ */

/* ─────────────────────────────────────────────────────── shortlist stages ── */

/** Where ONE candidate has reached on ONE job order. Ordered. */
export const CANDIDATE_STAGES = [
  "Sourced",
  "Screened",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Placed",
  "Declined",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

/** The stages a candidate is still in the running at. */
export function isLiveOnShortlist(stage: string): boolean {
  return stage !== "Declined" && stage !== "Placed";
}

/** Everything from "Shortlisted" on has been put in front of the client. */
export function isWithClient(stage: string): boolean {
  return stage === "Shortlisted" || stage === "Interviewing" || stage === "Offered";
}

/* ──────────────────────────────────────────────────────────── the match ──── */

const SENIORITY_RANK: Record<string, number> = { junior: 0, mid: 1, senior: 2, exec: 3 };

/**
 * Words that appear in half of all job titles on both sides and carry no signal
 * on their own. "Engineer" and "technologist" genuinely narrow the field, so
 * they stay; "manager" does not.
 */
const TITLE_STOPWORDS = new Set(["and", "of", "the", "senior", "junior", "lead", "head", "chief", "manager"]);

function titleOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w)));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits / Math.max(wa.size, wb.size);
}

export type MatchBreakdown = {
  score: number;
  seniority: number;
  sector: number;
  title: number;
  salary: number;
};

/**
 * How well a candidate fits a role, 0–100.
 *
 * A REAL score, not a decoration: every point is attributable, so a sourcer can
 * defend a shortlist to a client and the number means the same thing on every
 * screen. Ported from the owner's own `match.ts`, weights unchanged:
 *
 *   seniority 35 — the commonest reason a shortlist is rejected
 *   sector    25 — process-industry experience does not transfer freely
 *   title     25 — what they have actually done
 *   salary    15 — whether the expectation fits the role's budget
 *
 * ⚠️ DERIVED ON EVERY READ, never stored. A stored score would go on describing
 * a salary or a seniority that has since been corrected.
 */
export function matchScore(
  candidate: { seniority?: string | null; sector?: string | null; title?: string | null; expectedSalaryUsd?: string | number | null },
  order: { seniority?: string | null; sector?: string | null; title?: string | null; monthlyGrossUsd?: string | number | null },
): MatchBreakdown {
  const cs = candidate.seniority ?? "";
  const os = order.seniority ?? "";
  // An unknown seniority on either side scores the "two steps out" band rather
  // than a perfect fit — silence is not agreement.
  const seniority = cs && os && cs in SENIORITY_RANK && os in SENIORITY_RANK
    ? [35, 20, 6, 0][Math.min(Math.abs(SENIORITY_RANK[cs] - SENIORITY_RANK[os]), 3)]
    : 6;

  const sector = candidate.sector && order.sector
    ? (candidate.sector.trim().toLowerCase() === order.sector.trim().toLowerCase() ? 25 : 8)
    : 8;

  const title = Math.round(titleOverlap(candidate.title ?? "", order.title ?? "") * 25);

  const want = Number(candidate.expectedSalaryUsd ?? 0);
  const budget = Number(order.monthlyGrossUsd ?? 0);
  let salary = 2;
  if (want > 0 && budget > 0) {
    // Within 25% of the role's gross is a clean fit; past 60% it stops counting.
    const drift = Math.abs(1 - want / budget);
    salary = drift <= 0.25 ? 15 : drift <= 0.6 ? 8 : 2;
  }

  return {
    score: Math.max(0, Math.min(100, seniority + sector + title + salary)),
    seniority, sector, title, salary,
  };
}

/** Green above 70, amber above 45, otherwise quiet. */
export function matchTone(score: number): "success" | "warn" | "muted" {
  return score >= 70 ? "success" : score >= 45 ? "warn" : "muted";
}

/* ────────────────────────────────────────────────────────── interviews ───── */

export const INTERVIEW_KINDS = ["Screening", "Client interview", "Final"] as const;
export const INTERVIEW_OUTCOMES = ["Pending", "Passed", "Failed", "No show", "Cancelled"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

/**
 * The same moment, in both places. Coordinating across the time difference is
 * the work, so a screen that shows only one of the two clocks is doing half of
 * it. India keeps a single zone and does not observe daylight saving, so the
 * gap is a stable 2h30 behind EAT — but this asks the runtime rather than
 * assuming it.
 */
export function bothClocks(when: string | Date | null | undefined): string | null {
  if (!when) return null;
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return null;
  const t = (tz: string) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${t(EAT)} Dar · ${t("Asia/Kolkata")} India`;
}

/* ─────────────────────────────────────────────────────────── placements ──── */

export const FAULTS = ["candidate", "client", "neither"] as const;
export type Fault = (typeof FAULTS)[number];

export const FAULT_LABELS: Record<Fault, string> = {
  candidate: "The candidate",
  client: "The client",
  neither: "Neither side",
};

/**
 * What the guarantee obliges Oracle to do when a placement fails.
 *
 * Terms of Business cl. 6, stated plainly: a free replacement search unless the
 * CLIENT caused the departure, and never a refund in any case.
 */
export function remedyFor(fault: string | null | undefined): string {
  if (fault === "client")
    return "No free replacement is due — the client caused the departure. A further search is a new Job Order at the full fee.";
  return "A replacement search at no charge. The fee is not refunded — the replacement is the remedy.";
}

export type GuaranteeState = "notStarted" | "live" | "lapsed" | "failed";

/**
 * Where a placement stands. `live` means the first month is still running and
 * the check-ins are owed; `lapsed` means it ran clean and the obligation is
 * over; `failed` means it ended inside the month.
 */
export function guaranteeState(
  startedOn: string | null | undefined,
  endedOn: string | null | undefined,
  today = new Date(),
): GuaranteeState {
  if (endedOn) return "failed";
  if (!startedOn) return "notStarted";
  const ends = new Date(guaranteeEnds(String(startedOn).slice(0, 10)) + "T23:59:59Z");
  return today.getTime() <= ends.getTime() ? "live" : "lapsed";
}

/** Days left of the guarantee, or null before the person has started. */
export function guaranteeDaysLeft(startedOn: string | null | undefined, today = new Date()): number | null {
  if (!startedOn) return null;
  return daysBetween(today, new Date(guaranteeEnds(String(startedOn).slice(0, 10)) + "T00:00:00Z"));
}

/* ───────────────────────────────────────────────────────────── check-ins ─── */

export const CHECK_IN_PARTIES = ["client", "candidate"] as const;
export type CheckInParty = (typeof CHECK_IN_PARTIES)[number];

export type ExpectedCheckIn = {
  day: number;
  party: CheckInParty;
  dueOn: string;
  /** Already written down. */
  done: boolean;
  /** Due, and nobody has written anything. */
  overdue: boolean;
};

/**
 * The six conversations the first month owes, and which of them have happened.
 *
 * ⚠️ COMPUTED, NOT STORED. A check-in row is a record of a conversation that
 * took place; an outstanding one is the ABSENCE of a row. Creating six empty
 * placeholders at the start would mean a placement's evidence trail was six
 * blanks that look like work.
 */
export function expectedCheckIns(
  startedOn: string | null | undefined,
  recorded: { day: number; party: string }[],
  today = new Date(),
): ExpectedCheckIn[] {
  if (!startedOn) return [];
  const start = String(startedOn).slice(0, 10);
  const have = new Set(recorded.map((r) => `${r.day}:${r.party}`));
  const out: ExpectedCheckIn[] = [];
  for (const day of CHECK_IN_DAYS) {
    const dueOn = addDays(start, day);
    for (const party of CHECK_IN_PARTIES) {
      const done = have.has(`${day}:${party}`);
      out.push({
        day,
        party,
        dueOn,
        done,
        overdue: !done && new Date(dueOn + "T23:59:59Z").getTime() < today.getTime(),
      });
    }
  }
  return out;
}

/** How many of the six are still owed, and how many of those are late. */
export function checkInTally(expected: ExpectedCheckIn[]): { done: number; owed: number; overdue: number } {
  return {
    done: expected.filter((e) => e.done).length,
    owed: expected.filter((e) => !e.done).length,
    overdue: expected.filter((e) => e.overdue).length,
  };
}
