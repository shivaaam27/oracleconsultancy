// The fee is the whole of Oracle's income, so it is the thing most worth
// testing. These cases come from the owner's own workbook (Setup sheet, Aug
// 2026) and from the scenario table in `docs/07-current-state-aug-2026.md`.
//
// If one of these fails, either the workbook changed or someone changed what
// Oracle charges. Both need saying out loud.

import { describe, it, expect } from "vitest";
import {
  feeFor, vatRegistrationRequired, tzs, tzsFull, usd, compactTZS,
  USD_TZS, VAT_RATE, GUARANTEE_MONTHS, VAT_THRESHOLD_TZS, CANDIDATE_PAYS_TZS,
} from "./recruitment-money";
import {
  stageProgress, isOpenOrder, passportState, jobOrderRef, jobOrderRefPrefix,
  jobOrderRefSequence, guaranteeEnds, clientPapersMissing, candidatePapersMissing,
  JOB_STAGES,
} from "./recruitment-shared";

describe("the rule that never changes", () => {
  it("the candidate pays nothing", () => {
    expect(CANDIDATE_PAYS_TZS).toBe(0);
  });

  it("holds the workbook's settings", () => {
    expect(USD_TZS).toBe(2_700);
    expect(VAT_RATE).toBe(0.18);
    expect(GUARANTEE_MONTHS).toBe(1);
    expect(VAT_THRESHOLD_TZS).toBe(200_000_000);
  });
});

describe("feeFor", () => {
  it("charges exactly one month of gross — the base case from the workbook", () => {
    // USD 1,550 is the workbook's base candidate salary; it states the fee as
    // TZS 4,185,000.
    const f = feeFor(1_550)!;
    expect(f.grossTZS).toBe(4_185_000);
    expect(f.netTZS).toBe(4_185_000);
    expect(f.netTZS).toBe(f.grossTZS);          // one month. Not 1.5, not 2.
  });

  it("adds 18% VAT on top, and never inside", () => {
    const f = feeFor(1_550)!;
    expect(f.vatTZS).toBe(753_300);
    expect(f.totalTZS).toBe(4_938_300);
    expect(f.totalTZS - f.vatTZS).toBe(f.netTZS);   // VAT is never revenue
  });

  it("matches the low and high scenarios", () => {
    expect(feeFor(800)!.netTZS).toBe(2_160_000);
    expect(feeFor(2_500)!.netTZS).toBe(6_750_000);
  });

  it("takes the salary as a string, because that is how numeric columns arrive", () => {
    expect(feeFor("1550")).toEqual(feeFor(1550));
  });

  it("is null until the salary is agreed — never a fee of zero", () => {
    expect(feeFor(null)).toBeNull();
    expect(feeFor(undefined)).toBeNull();
    expect(feeFor(0)).toBeNull();
    expect(feeFor(-100)).toBeNull();
    expect(feeFor("")).toBeNull();
    expect(feeFor("not a number")).toBeNull();
  });
});

describe("vatRegistrationRequired", () => {
  it("is compulsory at the threshold, not merely above it", () => {
    expect(vatRegistrationRequired(199_999_999)).toBe(false);
    expect(vatRegistrationRequired(200_000_000)).toBe(true);
    expect(vatRegistrationRequired(449_685_000)).toBe(true);   // the realistic year
  });
});

describe("formatting", () => {
  it("groups in the workbook's style and never guesses at a missing figure", () => {
    expect(tzs(4_185_000)).toBe("4,185,000");
    expect(tzsFull(4_185_000)).toBe("TZS 4,185,000");
    expect(usd(1_550)).toBe("USD 1,550");
    expect(tzs(null)).toBe("—");
    expect(tzsFull(undefined)).toBe("—");
    expect(usd(null)).toBe("—");
  });

  it("compacts big money without lying about small money", () => {
    expect(compactTZS(4_185_000)).toBe("4.19m");
    expect(compactTZS(449_685_000)).toBe("449.69m");
    expect(compactTZS(12_000)).toBe("12k");
    expect(compactTZS(940)).toBe("940");
  });
});

describe("job order stages", () => {
  it("runs from sourcing to placed, and progress follows the order", () => {
    expect(JOB_STAGES[0]).toBe("Sourcing");
    expect(JOB_STAGES[JOB_STAGES.length - 1]).toBe("Placed");
    expect(stageProgress("Sourcing")).toBe(0);
    expect(stageProgress("Placed")).toBe(1);
    expect(stageProgress("Offer accepted")).toBeGreaterThan(stageProgress("Sourcing"));
    expect(stageProgress("nonsense")).toBe(0);
  });

  it("counts everything short of placed as open", () => {
    expect(isOpenOrder("Sourcing")).toBe(true);
    expect(isOpenOrder("Permit stage")).toBe(true);
    expect(isOpenOrder("Placed")).toBe(false);
    expect(isOpenOrder("Sourcing", true)).toBe(false);   // archived
  });
});

describe("references", () => {
  it("reads JO-2608-04 the way it is said out loud", () => {
    const opened = new Date("2026-08-19T00:00:00Z");
    expect(jobOrderRef(opened, 4)).toBe("JO-2608-04");
    expect(jobOrderRefPrefix(opened)).toBe("JO-2608-");
    expect(jobOrderRef(opened, 12)).toBe("JO-2608-12");
  });

  it("reads a sequence back out, and ignores anything that is not ours", () => {
    expect(jobOrderRefSequence("JO-2608-04")).toBe(4);
    expect(jobOrderRefSequence("JO-2608-12")).toBe(12);
    expect(jobOrderRefSequence("DS-001")).toBe(0);
    expect(jobOrderRefSequence("")).toBe(0);
  });
});

describe("the guarantee", () => {
  it("runs one calendar month from the start date", () => {
    expect(guaranteeEnds("2026-09-01")).toBe("2026-10-01");
    expect(guaranteeEnds("2026-12-15")).toBe("2027-01-15");
  });
});

describe("passports", () => {
  const today = new Date("2026-08-20T00:00:00Z");

  it("wants six months beyond today", () => {
    expect(passportState("2027-06-01", today)).toBe("ok");
    expect(passportState("2026-11-01", today)).toBe("tooSoon");
    expect(passportState("2026-01-01", today)).toBe("expired");
    expect(passportState(null, today)).toBe("none");
    expect(passportState("rubbish", today)).toBe("none");
  });
});

describe("the papers", () => {
  it("names what a client has not signed", () => {
    expect(clientPapersMissing({})).toEqual(["Terms of Business", "Data Sharing Agreement"]);
    expect(clientPapersMissing({ termsSignedOn: "2026-08-01", dsaSignedOn: "2026-08-01" })).toEqual([]);
  });

  it("names what a candidate has not signed", () => {
    expect(candidatePapersMissing({})).toEqual(["Registration & Consent", "Terms of Engagement"]);
    expect(candidatePapersMissing({ consentSignedOn: "2026-08-01" })).toEqual(["Terms of Engagement"]);
  });
});
