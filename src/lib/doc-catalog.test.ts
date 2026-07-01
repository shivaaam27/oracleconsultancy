import { describe, it, expect } from "vitest";
import { bestDocType, deriveFiling, parseConventionalName } from "./doc-catalog";

describe("doc catalogue classifier", () => {
  it("shelves NSSF under People & HR (not Immigration)", () => {
    const t = bestDocType("DarSpices_NSSF-Document.pdf");
    expect(t?.shelf).toBe("People & HR");
    expect(t?.companyReqKey).toBe("nssf-registration");
  });
  it("shelves a BRELA search under Legal & Registration (not Lease)", () => {
    expect(bestDocType("DarSpices_BRELA-Company-Search.pdf")?.shelf).toBe("Legal & Registration");
  });
  it("keeps a business licence in Licences & Permits (not Tax)", () => {
    const t = bestDocType("DarSpices_Business-License_EXP-2026-10-05.pdf");
    expect(t?.shelf).toBe("Licences & Permits");
    expect(t?.companyReqKey).toBe("business-licence");
  });
  it("does not let a body taxpayer number override the filename type", () => {
    expect(bestDocType("DarSpices_NSSF-Document.pdf", "taxpayer identification number 123")?.key).toBe("nssf");
  });
  it("maps VRN to the VAT requirement", () => {
    expect(bestDocType("DarSpices_VRN-Certificate.pdf")?.companyReqKey).toBe("vat-registration");
  });
  it("routes an employment contract to the person side", () => {
    const t = bestDocType("DarSpices_Contract_Sanjay-Kaushik.pdf");
    expect(t?.ownerType).toBe("person");
    expect(t?.shelf).toBe("People & HR");
  });
});

describe("parseConventionalName", () => {
  it("reads the EXP date and OLD marker", () => {
    const p = parseConventionalName("DarSpices_Business-License-OLD_EXP-2025-10-06.pdf");
    expect(p.expiry).toBe("2025-10-06");
    expect(p.isOld).toBe(true);
  });
  it("trusts the filename expiry over any content date", () => {
    const f = deriveFiling("DarSpices_Business-License_EXP-2026-10-05.pdf", null, "issued 2024");
    expect(f.expiry).toBe("2026-10-05");
    expect(f.isOld).toBe(false);
    expect(f.companyReqKey).toBe("business-licence");
  });
});
