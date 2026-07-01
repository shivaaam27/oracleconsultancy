import { describe, it, expect } from "vitest";
import { extractFactsFromText } from "./fact-extract";

const P = { hasPerson: true, hasCompany: false };
const C = { hasPerson: false, hasCompany: true };
const BOTH = { hasPerson: true, hasCompany: true };

describe("extractFactsFromText", () => {
  it("pulls a passport number for a person", () => {
    const r = extractFactsFromText("Passport No. AL562003 Surname MATHANKAR", P);
    expect(r.identity.passportNo).toBe("AL562003");
    expect(r.facts).toContainEqual({ entityType: "person", field: "Passport No", value: "AL562003" });
  });

  it("normalises an OCR-split passport number", () => {
    const r = extractFactsFromText("PASSPORT NUMBER: AL 562003", P);
    expect(r.identity.passportNo).toBe("AL562003");
  });

  it("pulls a TIN for a company", () => {
    const r = extractFactsFromText("TIN: 180-271-953  VRN 40-123456-A", C);
    expect(r.identity.tin).toBe("180-271-953");
    expect(r.identity.vrn).toBe("40-123456-A");
  });

  it("pulls a 20-digit national ID for a person", () => {
    const r = extractFactsFromText("NIDA 19880402-11102-00001-28", P);
    expect(r.identity.nationalId).toBe("19880402-11102-00001-28");
  });

  it("reads authorised share capital", () => {
    const r = extractFactsFromText("AUTHORISED SHARE CAPITAL 100,000,000 TZS", C);
    expect(r.facts).toContainEqual({ entityType: "company", field: "Authorised Share Capital", value: "100000000" });
  });

  it("does not attribute a person fact when there is no person owner", () => {
    const r = extractFactsFromText("Passport No. AL562003", C);
    expect(r.facts).toHaveLength(0);
  });

  it("returns nothing for empty text", () => {
    expect(extractFactsFromText("", BOTH).facts).toHaveLength(0);
    expect(extractFactsFromText(null, BOTH).facts).toHaveLength(0);
  });
});
