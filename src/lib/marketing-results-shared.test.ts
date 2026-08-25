import { describe, it, expect } from "vitest";
import {
  sumKnown, engagementOf, latestBySource, bestReading, followerGrowth,
  summariseSpend, spendInMonth, capCheck, costPerThousand,
  type MktResult,
} from "./marketing-results-shared";

const r = (o: Partial<MktResult>): MktResult => ({
  id: 1, publicationId: 1, readAt: "2026-09-01T09:00:00.000Z", source: "typed",
  reach: null, impressions: null, likes: null, comments: null, shares: null,
  saves: null, clicks: null, followers: null, ...o,
});

describe("a missing figure is not a zero", () => {
  it("adds only what is known", () => {
    expect(sumKnown([3, null, 4])).toBe(7);
    expect(sumKnown([0, null])).toBe(0);
  });

  it("returns null when nothing at all is known", () => {
    // "Nobody typed a figure" and "it got no likes" are different facts, and a
    // zero in a report reads as the second one.
    expect(sumKnown([null, undefined])).toBeNull();
    expect(engagementOf(r({}))).toBeNull();
  });

  it("adds up engagement across the four", () => {
    expect(engagementOf(r({ likes: 10, comments: 2, shares: null, saves: 1 }))).toBe(13);
  });
});

describe("which reading counts", () => {
  const typedOld = r({ id: 1, source: "typed", readAt: "2026-09-01T09:00:00.000Z", reach: 100 });
  const typedNew = r({ id: 2, source: "typed", readAt: "2026-09-05T09:00:00.000Z", reach: 180 });
  const platform = r({ id: 3, source: "platform", readAt: "2026-09-04T09:00:00.000Z", reach: 210 });

  it("takes the newest reading per source, never an average", () => {
    // Figures revise upward for days; the newest is the truest.
    const latest = latestBySource([typedOld, typedNew, platform]);
    expect(latest.get("typed")!.id).toBe(2);
    expect(latest.get("platform")!.id).toBe(3);
  });

  it("keeps typed and platform apart rather than blending them", () => {
    // They count differently and will disagree. A blend is neither figure.
    const latest = latestBySource([typedNew, platform]);
    expect(latest.size).toBe(2);
    expect(latest.get("typed")!.reach).toBe(180);
    expect(latest.get("platform")!.reach).toBe(210);
  });

  it("prefers the platform's own figure when there is one", () => {
    expect(bestReading([typedNew, platform])!.id).toBe(3);
    expect(bestReading([typedNew])!.id).toBe(2);
    expect(bestReading([])).toBeNull();
  });
});

describe("follower growth", () => {
  it("measures between the first and last reading that carried a count", () => {
    const g = followerGrowth([
      r({ readAt: "2026-09-01T00:00:00.000Z", followers: 400 }),
      r({ readAt: "2026-09-11T00:00:00.000Z", followers: 460 }),
    ])!;
    expect(g.from).toBe(400);
    expect(g.to).toBe(460);
    expect(g.gained).toBe(60);
    expect(g.percent).toBeCloseTo(15, 5);
    expect(g.days).toBe(10);
  });

  it("skips readings with no follower count instead of reading them as zero", () => {
    // A reading typed in a hurry with only the likes filled in would otherwise
    // look like every follower vanished and came back.
    const g = followerGrowth([
      r({ readAt: "2026-09-01T00:00:00.000Z", followers: 400 }),
      r({ readAt: "2026-09-05T00:00:00.000Z", likes: 12 }),
      r({ readAt: "2026-09-11T00:00:00.000Z", followers: 460 }),
    ])!;
    expect(g.from).toBe(400);
    expect(g.to).toBe(460);
  });

  it("needs two readings, and gives no percentage from nothing", () => {
    expect(followerGrowth([r({ followers: 400 })])).toBeNull();
    const g = followerGrowth([
      r({ readAt: "2026-09-01T00:00:00.000Z", followers: 0 }),
      r({ readAt: "2026-09-02T00:00:00.000Z", followers: 50 }),
    ])!;
    expect(g.gained).toBe(50);
    expect(g.percent).toBeNull(); // a percentage of zero means nothing
  });
});

describe("who paid", () => {
  it("splits our money from theirs", () => {
    // Design and posting are free and the advert money is ours — "what has this
    // offer cost us" is the `ours` figure and must not fold in their own spend.
    const s = summariseSpend([
      { amount: 50_000, borneBy: "us" },
      { amount: 30_000, borneBy: "us" },
      { amount: 20_000, borneBy: "client" },
    ]);
    expect(s.ours).toBe(80_000);
    expect(s.theirs).toBe(20_000);
    expect(s.total).toBe(100_000);
  });

  it("treats anything unrecognised as ours, which is the safe direction", () => {
    expect(summariseSpend([{ amount: 10, borneBy: "" }]).ours).toBe(10);
  });

  it("picks out a month", () => {
    const rows = [{ onDate: "2026-08-31" }, { onDate: "2026-09-01" }, { onDate: "2026-09-30" }];
    expect(spendInMonth(rows, "2026-09")).toHaveLength(2);
  });
});

describe("the agreed ceiling", () => {
  it("reports usage when a cap was agreed", () => {
    const c = capCheck(75_000, 100_000);
    expect(c.usedPercent).toBeCloseTo(75, 5);
    expect(c.over).toBe(false);
    expect(capCheck(120_000, 100_000).over).toBe(true);
  });

  it("does NOT treat 'no cap agreed' as a cap of zero", () => {
    // The owner named no limit. Claiming an overrun against a number nobody
    // chose would be inventing a rule.
    const c = capCheck(50_000, null);
    expect(c.cap).toBeNull();
    expect(c.usedPercent).toBeNull();
    expect(c.over).toBe(false);
  });
});

describe("cost per thousand reached", () => {
  it("works it out when reach is known", () => {
    expect(costPerThousand(50_000, 25_000)).toBeCloseTo(2000, 5);
  });

  it("refuses to invent one when reach is unknown or nil", () => {
    expect(costPerThousand(50_000, null)).toBeNull();
    expect(costPerThousand(50_000, 0)).toBeNull();
  });
});
