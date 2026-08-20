// Phase 2 arithmetic: the match score, the guarantee clock and the six
// conversations the first month owes.
//
// The match score is the number a sourcer has to defend to a client, and the
// check-in tally is the evidence trail a disputed placement rests on. Both are
// worked out on every read, so a mistake here is a mistake on every screen.

import { describe, it, expect } from "vitest";
import {
  matchScore, matchTone,
  guaranteeState, guaranteeDaysLeft, remedyFor,
  expectedCheckIns, checkInTally,
  isLiveOnShortlist, isWithClient, bothClocks,
  CANDIDATE_STAGES,
} from "./recruitment-shared";

const ORDER = {
  seniority: "senior",
  sector: "Cement and steel",
  title: "Production Manager",
  monthlyGrossUsd: "1550",
};

describe("matchScore", () => {
  it("gives full marks to a candidate who fits on every axis", () => {
    const m = matchScore(
      { seniority: "senior", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 1550 },
      ORDER,
    );
    expect(m.seniority).toBe(35);
    expect(m.sector).toBe(25);
    expect(m.title).toBe(25);
    expect(m.salary).toBe(15);
    expect(m.score).toBe(100);
  });

  it("docks a step of seniority hardest, because that is what gets rejected", () => {
    const one = matchScore({ seniority: "mid", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 1550 }, ORDER);
    const two = matchScore({ seniority: "junior", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 1550 }, ORDER);
    expect(one.seniority).toBe(20);
    expect(two.seniority).toBe(6);
    expect(one.score).toBeGreaterThan(two.score);
  });

  it("treats a different sector as weak but not worthless", () => {
    const m = matchScore({ seniority: "senior", sector: "Textiles", title: "Production Manager", expectedSalaryUsd: 1550 }, ORDER);
    expect(m.sector).toBe(8);
  });

  it("ignores 'manager' when comparing titles — half of them carry it", () => {
    const m = matchScore({ seniority: "senior", sector: "Cement and steel", title: "Manager", expectedSalaryUsd: 1550 }, ORDER);
    expect(m.title).toBe(0);
  });

  it("scores the salary by how far the expectation drifts from the budget", () => {
    const near = matchScore({ seniority: "senior", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 1800 }, ORDER);
    const wide = matchScore({ seniority: "senior", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 2300 }, ORDER);
    const silly = matchScore({ seniority: "senior", sector: "Cement and steel", title: "Production Manager", expectedSalaryUsd: 6000 }, ORDER);
    expect(near.salary).toBe(15);
    expect(wide.salary).toBe(8);
    expect(silly.salary).toBe(2);
  });

  it("does not treat missing information as a perfect fit", () => {
    const m = matchScore({}, ORDER);
    expect(m.seniority).toBe(6);
    expect(m.sector).toBe(8);
    expect(m.title).toBe(0);
    expect(m.salary).toBe(2);
    expect(m.score).toBe(16);
  });

  it("stays inside 0–100 whatever it is given", () => {
    const m = matchScore(
      { seniority: "exec", sector: "X", title: "A B C D E F G", expectedSalaryUsd: -5 },
      { seniority: "junior", sector: "Y", title: "Z", monthlyGrossUsd: 0 },
    );
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
  });

  it("colours the score the same way everywhere", () => {
    expect(matchTone(85)).toBe("success");
    expect(matchTone(55)).toBe("warn");
    expect(matchTone(20)).toBe("muted");
  });
});

describe("shortlist stages", () => {
  it("knows who is still in the running and who is in front of the client", () => {
    expect(CANDIDATE_STAGES).toContain("Declined");
    expect(isLiveOnShortlist("Interviewing")).toBe(true);
    expect(isLiveOnShortlist("Declined")).toBe(false);
    expect(isLiveOnShortlist("Placed")).toBe(false);
    expect(isWithClient("Shortlisted")).toBe(true);
    expect(isWithClient("Offered")).toBe(true);
    expect(isWithClient("Sourced")).toBe(false);
  });
});

describe("the guarantee", () => {
  const today = new Date("2026-09-20T00:00:00Z");

  it("has not begun until the person actually starts", () => {
    // Accepted the offer but still in the client's permit process.
    expect(guaranteeState(null, null, today)).toBe("notStarted");
    expect(guaranteeDaysLeft(null, today)).toBeNull();
  });

  it("runs for one month from the START date, not from acceptance", () => {
    expect(guaranteeState("2026-09-01", null, today)).toBe("live");
    expect(guaranteeDaysLeft("2026-09-01", today)).toBe(11);
  });

  it("lapses cleanly once the month is up", () => {
    expect(guaranteeState("2026-07-01", null, today)).toBe("lapsed");
  });

  it("is failed the moment an end date is recorded", () => {
    expect(guaranteeState("2026-09-01", "2026-09-15", today)).toBe("failed");
  });

  it("names the right remedy, and never a refund", () => {
    expect(remedyFor("candidate")).toMatch(/no charge/i);
    expect(remedyFor("candidate")).toMatch(/not refunded/i);
    expect(remedyFor("neither")).toMatch(/no charge/i);
    // The client's own fault: no free replacement, a new job order at full fee.
    expect(remedyFor("client")).toMatch(/No free replacement/i);
    expect(remedyFor("client")).toMatch(/full fee/i);
  });
});

describe("check-ins", () => {
  it("owes six conversations — both sides, on days 7, 14 and 30", () => {
    const e = expectedCheckIns("2026-09-01", [], new Date("2026-09-02T00:00:00Z"));
    expect(e).toHaveLength(6);
    expect(e.map((x) => x.day)).toEqual([7, 7, 14, 14, 30, 30]);
    expect(e.map((x) => x.party)).toEqual(["client", "candidate", "client", "candidate", "client", "candidate"]);
    expect(e[0].dueOn).toBe("2026-09-08");
    expect(e[4].dueOn).toBe("2026-10-01");
  });

  it("owes nothing until the person has started", () => {
    expect(expectedCheckIns(null, [])).toEqual([]);
  });

  it("counts a conversation as done only when it was written down", () => {
    const e = expectedCheckIns(
      "2026-09-01",
      [{ day: 7, party: "client" }, { day: 7, party: "candidate" }],
      new Date("2026-09-20T00:00:00Z"),
    );
    const tally = checkInTally(e);
    expect(tally.done).toBe(2);
    expect(tally.owed).toBe(4);
    // Day 14 fell on the 15th and nobody has written anything — both are late.
    expect(tally.overdue).toBe(2);
  });

  it("does not call a check-in late before it is due", () => {
    const e = expectedCheckIns("2026-09-01", [], new Date("2026-09-05T00:00:00Z"));
    expect(checkInTally(e).overdue).toBe(0);
  });
});

describe("interview times", () => {
  it("shows the same moment on both clocks", () => {
    // 09:00 UTC = 12:00 in Dar es Salaam (UTC+3), 14:30 in India (UTC+5:30).
    const s = bothClocks("2026-09-01T09:00:00Z");
    expect(s).toContain("12:00");
    expect(s).toContain("14:30");
    expect(bothClocks(null)).toBeNull();
  });
});
