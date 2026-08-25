import { describe, it, expect } from "vitest";
import {
  addMonths, freePeriod, postState, tidyHandle, ownerKey,
  type MktPublication,
} from "./marketing-shared";

const pub = (o: Partial<MktPublication>): MktPublication => ({
  id: 1, postId: 1, accountId: 1, status: "planned",
  plannedFor: null, publishedAt: null, url: null, reason: null, ...o,
});

const NOW = new Date("2026-09-10T09:00:00Z");

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths("2026-09-10", 3)).toBe("2026-12-10");
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
  });

  it("clamps to the end of a shorter month rather than rolling over", () => {
    // 30 Nov + 3 months is 28 Feb, NOT 2 March. Rolling over is how a free
    // period quietly runs long on some clients and not others.
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-11-29", 3)).toBe("2027-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("knows about leap years", () => {
    expect(addMonths("2027-11-30", 3)).toBe("2028-02-29");
  });
});

describe("the free three months", () => {
  const client = { freeMonths: 3, freeStartsOn: null };

  it("has not started until something is actually posted", () => {
    const f = freePeriod(client, null, NOW);
    expect(f.state).toBe("not started");
    expect(f.startsOn).toBeNull();
    expect(f.endsOn).toBeNull();
    expect(f.source).toBe("none");
  });

  it("starts on the first post, not on the handshake", () => {
    const f = freePeriod(client, "2026-09-01T14:00:00Z", NOW);
    expect(f.startsOn).toBe("2026-09-01");
    expect(f.endsOn).toBe("2026-12-01");
    expect(f.source).toBe("first post");
    expect(f.state).toBe("running");
    expect(f.daysLeft).toBe(82);
  });

  it("lets a stated start beat the inferred one", () => {
    // Somebody saying so is better evidence than an inference from the data.
    const f = freePeriod({ freeMonths: 3, freeStartsOn: "2026-08-01" }, "2026-09-01T14:00:00Z", NOW);
    expect(f.startsOn).toBe("2026-08-01");
    expect(f.endsOn).toBe("2026-11-01");
    expect(f.source).toBe("stated");
  });

  it("shouts when the end is close, and says so once it has passed", () => {
    // ends 20 Sep — ten days off, inside the fortnight
    expect(freePeriod(client, "2026-06-20T00:00:00Z", NOW).state).toBe("ending soon");
    // ends 25 Sep — fifteen days off, still just outside it
    expect(freePeriod(client, "2026-06-25T00:00:00Z", NOW).state).toBe("running");
    expect(freePeriod(client, "2026-05-01T00:00:00Z", NOW).state).toBe("ended");       // ended 1 Aug
  });

  it("counts the last day as still running, not ended", () => {
    // Ends exactly today: the client still has today. Off by one here and we
    // stop paying for adverts a day early, on the day itself.
    const f = freePeriod(client, "2026-06-10T00:00:00Z", NOW); // ends 10 Sep
    expect(f.daysLeft).toBe(0);
    expect(f.state).toBe("ending soon");
  });
});

describe("what state a post is in", () => {
  it("is an idea until it is going somewhere", () => {
    expect(postState([], NOW)).toBe("idea");
  });

  it("is scheduled, then overdue once its time has passed", () => {
    expect(postState([pub({ plannedFor: "2026-09-20T09:00:00Z" })], NOW)).toBe("scheduled");
    expect(postState([pub({ plannedFor: "2026-09-01T09:00:00Z" })], NOW)).toBe("overdue");
  });

  it("is published only when every account has it", () => {
    const out = pub({ id: 1, accountId: 1, status: "published", publishedAt: "2026-09-09T10:00:00Z" });
    expect(postState([out], NOW)).toBe("published");
    expect(postState([out, out], NOW)).toBe("published");
  });

  it("says PARTLY OUT rather than rounding to published", () => {
    // One design to three accounts, one of which failed. Calling that
    // "published" hides the only thing anybody needed to know.
    const good = pub({ id: 1, accountId: 1, status: "published", publishedAt: "2026-09-09T10:00:00Z" });
    const bad = pub({ id: 2, accountId: 2, status: "failed", reason: "rejected by the app" });
    expect(postState([good, bad], NOW)).toBe("partly out");
  });

  it("ignores taken-down publications when judging the rest", () => {
    const good = pub({ id: 1, accountId: 1, status: "published", publishedAt: "2026-09-09T10:00:00Z" });
    const gone = pub({ id: 2, accountId: 2, status: "removed", reason: "wrong price shown" });
    expect(postState([good, gone], NOW)).toBe("published");
    // …but a post that is ONLY taken down is taken down.
    expect(postState([gone], NOW)).toBe("removed");
  });
});

describe("small helpers", () => {
  it("tidies a handle however it was typed", () => {
    expect(tidyHandle("cocozuri")).toBe("@cocozuri");
    expect(tidyHandle("@cocozuri")).toBe("@cocozuri");
    expect(tidyHandle("  @@coco zuri ")).toBe("@cocozuri");
  });

  it("groups an account by whichever owner it has", () => {
    expect(ownerKey({ companyId: 4, clientId: null })).toBe("company:4");
    expect(ownerKey({ companyId: null, clientId: 7 })).toBe("client:7");
  });
});
