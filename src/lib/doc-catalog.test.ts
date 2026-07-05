import { describe, it, expect } from "vitest";
import { bestDocType, deriveFiling, parseConventionalName, subjectCompatible, subjectTokensOf, sameLogicalDocPair } from "./doc-catalog";

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
  it("lets the document CONTENT decide the type over a misleading filename (content-first)", () => {
    // Filename says NSSF, but the body reads as a taxpayer/TIN document — content wins.
    expect(bestDocType("DarSpices_NSSF-Document.pdf", "taxpayer identification number 123")?.key).toBe("tin-certificate");
  });
  it("falls back to the filename only when the body has no type signal (last resort)", () => {
    expect(bestDocType("DarSpices_NSSF-Document.pdf", "page 1 of 2")?.key).toBe("nssf");
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

describe("catalogue fixes (Phase 4)", () => {
  it("a WCF payment receipt is the WCF type, not a plain banking receipt", () => {
    expect(bestDocType("DarSpices_WCF-Receipt.pdf")?.key).toBe("wcf");
  });
  it("recognises a Swahili business licence", () => {
    const t = bestDocType("Leseni ya Biashara 2026.pdf");
    expect(t?.key).toBe("business-licence");
    expect(t?.companyReqKey).toBe("business-licence");
  });
  it("recognises a Swahili employment contract on the person side", () => {
    expect(bestDocType("Mkataba wa Ajira - Sanjay.pdf")?.key).toBe("employment-contract");
  });
  it("the sector permit no longer points at a non-existent requirement key", () => {
    expect(bestDocType("Cocozuri_TFDA-Food-Permit.pdf")?.key).toBe("sector-permit");
    expect(bestDocType("Cocozuri_TFDA-Food-Permit.pdf")?.companyReqKey).toBeUndefined();
  });
});

describe("subjectTokensOf", () => {
  it("keeps the distinctive subject, drops prefix/type/format/year noise", () => {
    const toks = subjectTokensOf("DarSpices_Work-Permit_Sanjay-Kaushik_EXP-2027-01-01.pdf", "darspices", "work-permit");
    expect(toks.has("sanjay")).toBe(true);
    expect(toks.has("kaushik")).toBe(true);
    expect(toks.has("darspices")).toBe(false); // prefix
    expect(toks.has("permit")).toBe(false); // type alias word
    expect(toks.has("2027")).toBe(false); // year
    expect(toks.has("pdf")).toBe(false); // format
  });
});

describe("subjectCompatible", () => {
  it("same subject across formats is compatible", () => {
    const a = subjectTokensOf("Cocozuri_Contract_Sanjay-Kaushik.docx", "cocozuri", "employment-contract");
    const b = subjectTokensOf("Cocozuri_Contract_Sanjay-Kaushik.pdf", "cocozuri", "employment-contract");
    expect(subjectCompatible(a, b)).toBe(true);
  });
  it("two different people sharing one name are NOT compatible", () => {
    const a = subjectTokensOf("Cocozuri_Contract_Kasaba-Juma.pdf", "cocozuri", "employment-contract");
    const b = subjectTokensOf("Cocozuri_Contract_Juma-Bagomwa.pdf", "cocozuri", "employment-contract");
    expect(subjectCompatible(a, b)).toBe(false);
  });
  it("no subject on either side is not decisive (null)", () => {
    expect(subjectCompatible(new Set(), new Set(["x"]))).toBeNull();
  });
});

describe("sameLogicalDocPair — guards renewal chaining + the dedup sweep", () => {
  const doc = (file_name: string, reference_no: string | null = null, expiry_date: string | null = null) =>
    ({ file_name, title: null, reference_no, expiry_date });

  it("an incorporation certificate and a BRELA search sharing a registration number are DIFFERENT docs", () => {
    // Both carry the registration number, but they are different catalogue types.
    expect(sameLogicalDocPair(
      doc("DarSpices_Certificate-of-Incorporation_112233.pdf"),
      doc("DarSpices_BRELA-Search_112233.pdf"),
    )).toBe(false);
  });

  it("two premises leases with different expiries are DIFFERENT docs", () => {
    expect(sameLogicalDocPair(
      doc("DarSpices_Lease-Agreement_Godown-A.pdf", null, "2027-01-31"),
      doc("DarSpices_Lease-Agreement_Godown-B.pdf", null, "2028-06-30"),
    )).toBe(false);
  });

  it("the same document as a photo and a PDF IS the same doc", () => {
    expect(sameLogicalDocPair(
      doc("DarSpices_Business-Licence_BL-99.jpg", "BL-99", "2027-06-01"),
      doc("DarSpices_Business-Licence_BL-99.pdf", "BL-99", "2027-06-01"),
    )).toBe(true);
  });
});
