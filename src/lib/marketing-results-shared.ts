/**
 * Marketing, Phase 3 — results and money. The PURE half.
 *
 * ⚠️ CLIENT-SAFE. No `sb`, no database. `marketing-results.ts` is server-only.
 *
 * ⚠️ NOTHING HERE IS STORED. Totals, growth and what the free offer has cost are
 * all worked out on read, like every other figure in this module.
 */

export const RESULT_SOURCES = ["typed", "platform"] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

export const BORNE_BY = ["us", "client"] as const;
export type BorneBy = (typeof BORNE_BY)[number];

export type MktResult = {
  id: number;
  publicationId: number;
  readAt: string;
  source: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  followers: number | null;
};

export type MktSpendRow = {
  id: number;
  onDate: string;
  amount: number;
  borneBy: string;
  clientId: number | null;
  companyId: number | null;
  campaignId: number | null;
  publicationId: number | null;
};

/** The engagement figures, added up. Nulls are IGNORED, never counted as 0. */
export const ENGAGEMENT_KEYS = ["likes", "comments", "shares", "saves"] as const;

/**
 * Add numbers where at least one is known.
 *
 * ⚠️ RETURNS null WHEN NOTHING IS KNOWN, not 0. "Nobody typed a figure" and
 * "it got no likes" are different facts, and a zero in a report reads as the
 * second one.
 */
export function sumKnown(values: (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => typeof v === "number");
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Total engagement in one reading. null when none of the four is known. */
export function engagementOf(r: Pick<MktResult, "likes" | "comments" | "shares" | "saves">): number | null {
  return sumKnown(ENGAGEMENT_KEYS.map((k) => r[k]));
}

/**
 * The reading that counts for a publication: the LATEST one, per source.
 *
 * ⚠️ NOT AN AVERAGE, AND NOT A MERGE. Figures revise upward for days; the newest
 * reading is the truest one. And typed and platform readings are kept apart
 * because they will disagree — the platforms count differently — and blending
 * them would produce a number that is neither.
 */
export function latestBySource(results: MktResult[]): Map<string, MktResult> {
  const out = new Map<string, MktResult>();
  for (const r of results) {
    const seen = out.get(r.source);
    if (!seen || r.readAt > seen.readAt) out.set(r.source, r);
  }
  return out;
}

/** One publication's best-known figures, preferring the platform's own. */
export function bestReading(results: MktResult[]): MktResult | null {
  const latest = latestBySource(results);
  return latest.get("platform") ?? latest.get("typed") ?? null;
}

export type Growth = {
  from: number;
  to: number;
  gained: number;
  /** null when it started at nothing — a percentage from zero means nothing. */
  percent: number | null;
  days: number;
};

/**
 * Follower growth between the first and last reading that carried a figure.
 *
 * ⚠️ IT SKIPS READINGS WITH NO FOLLOWER COUNT rather than treating them as
 * zero — a reading typed in a hurry with only the likes filled in would
 * otherwise look like every follower vanished and came back.
 */
export function followerGrowth(results: MktResult[]): Growth | null {
  const withFollowers = results
    .filter((r) => typeof r.followers === "number")
    .sort((a, b) => a.readAt.localeCompare(b.readAt));
  if (withFollowers.length < 2) return null;

  const first = withFollowers[0];
  const last = withFollowers[withFollowers.length - 1];
  const from = first.followers!;
  const to = last.followers!;
  const days = Math.max(0, Math.round(
    (Date.parse(last.readAt) - Date.parse(first.readAt)) / 86_400_000,
  ));
  return {
    from, to, gained: to - from,
    percent: from > 0 ? ((to - from) / from) * 100 : null,
    days,
  };
}

export type SpendSummary = {
  /** What WE paid — the cost of the free offer. */
  ours: number;
  /** What the client paid themselves. */
  theirs: number;
  total: number;
};

/**
 * Add spend up, split by who actually paid.
 *
 * ⚠️ THE SPLIT IS THE POINT. Design and posting are free for a client and the
 * advert money is ours — so "what has this offer cost us" is `ours`, and it must
 * never be quietly folded in with money the client put up themselves.
 */
export function summariseSpend(rows: Pick<MktSpendRow, "amount" | "borneBy">[]): SpendSummary {
  let ours = 0, theirs = 0;
  for (const r of rows) {
    if (r.borneBy === "client") theirs += r.amount;
    else ours += r.amount;
  }
  return { ours, theirs, total: ours + theirs };
}

/** Spend inside a month, as YYYY-MM. */
export function spendInMonth<T extends { onDate: string }>(rows: T[], month: string): T[] {
  return rows.filter((r) => r.onDate.slice(0, 7) === month);
}

export type CapCheck = {
  spent: number;
  cap: number | null;
  /** null when no cap was agreed — never shown as 0% of nothing. */
  usedPercent: number | null;
  over: boolean;
};

/**
 * This month's spend on a client against whatever ceiling was agreed.
 *
 * ⚠️ NO CAP IS NOT A CAP OF ZERO. The owner named no limit, so an unset ceiling
 * reports the spend and says no limit was agreed — it never claims an overrun
 * against a number nobody chose.
 */
export function capCheck(spentThisMonth: number, cap: number | null): CapCheck {
  if (cap == null || cap <= 0) {
    return { spent: spentThisMonth, cap: null, usedPercent: null, over: false };
  }
  return {
    spent: spentThisMonth,
    cap,
    usedPercent: (spentThisMonth / cap) * 100,
    over: spentThisMonth > cap,
  };
}

/**
 * Cost per thousand people reached — the one comparison worth making.
 * ⚠️ null when reach is unknown or nil; dividing by it would invent a figure.
 */
export function costPerThousand(spend: number, reach: number | null): number | null {
  if (reach == null || reach <= 0) return null;
  return (spend / reach) * 1000;
}
