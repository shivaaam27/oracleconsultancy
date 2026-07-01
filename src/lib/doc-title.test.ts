import { describe, it, expect } from "vitest";
import { buildDocTitle } from "./documents-shared";

describe("buildDocTitle (house naming format)", () => {
  it("Prefix_DocType", () => {
    expect(buildDocTitle({ prefix: "DarSpices", type: "TIN Certificate" })).toBe("DarSpices_TIN-Certificate");
  });
  it("hyphenates a multi-word type", () => {
    expect(buildDocTitle({ prefix: "DarSpices", type: "Certificate of Incorporation" })).toBe("DarSpices_Certificate-of-Incorporation");
  });
  it("appends _EXP-<date> for an expiring document", () => {
    expect(buildDocTitle({ prefix: "DarSpices", type: "Business Licence", expiry: "2026-10-05" })).toBe("DarSpices_Business-Licence_EXP-2026-10-05");
  });
  it("keeps ref then expiry", () => {
    expect(buildDocTitle({ prefix: "PES", type: "Business Licence Industrial Spare Parts", expiry: "2026-11-06" })).toBe("PES_Business-Licence-Industrial-Spare-Parts_EXP-2026-11-06");
  });
  it("adds a ref suffix", () => {
    expect(buildDocTitle({ prefix: "PES", type: "Certificate of Incorporation", ref: "168521" })).toBe("PES_Certificate-of-Incorporation_168521");
  });
  it("falls back to the owner name when no prefix", () => {
    expect(buildDocTitle({ owner: "Mr Gangadhar Mathankar", type: "Passport", ref: "AL562003" })).toBe("Mr-Gangadhar-Mathankar_Passport_AL562003");
  });
  it("uses the year when there is no ref or expiry", () => {
    expect(buildDocTitle({ prefix: "PES", type: "BRELA Search Report", date: "2026-05-05" })).toBe("PES_BRELA-Search-Report_2026");
  });
  it("returns Document when nothing composes", () => {
    expect(buildDocTitle({})).toBe("Document");
  });
});
