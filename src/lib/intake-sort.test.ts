import { describe, it, expect } from "vitest";
import { formatSupersede, isPdfFile, isImageFile, categoryFromFolder } from "@/lib/documents-shared";

// The auto-sorter's photo↔PDF rule decides whether one document is binned in
// favour of another. A false positive trashes a genuinely different file, so the
// rule must fire ONLY for the clear image-vs-PDF pair — never two PDFs, two
// photos, or office files.

describe("file format detection", () => {
  it("recognises PDFs by name and MIME", () => {
    expect(isPdfFile("licence.PDF")).toBe(true);
    expect(isPdfFile("application/pdf")).toBe(true);
    expect(isPdfFile("photo.jpg")).toBe(false);
  });
  it("recognises images by name and MIME", () => {
    for (const n of ["scan.jpg", "scan.JPEG", "x.png", "x.heic", "image/jpeg"]) {
      expect(isImageFile(n)).toBe(true);
    }
    expect(isImageFile("doc.pdf")).toBe(false);
  });
});

describe("formatSupersede", () => {
  it("incoming PDF beats an existing photo", () => {
    expect(formatSupersede("permit.pdf", "permit.jpg")).toBe("incoming-wins");
  });
  it("an existing PDF beats an incoming photo", () => {
    expect(formatSupersede("permit.jpg", "permit.pdf")).toBe("existing-wins");
  });
  it("never fires for two PDFs", () => {
    expect(formatSupersede("a.pdf", "b.pdf")).toBeNull();
  });
  it("never fires for two photos", () => {
    expect(formatSupersede("a.jpg", "b.png")).toBeNull();
  });
  it("never fires for office files vs anything", () => {
    expect(formatSupersede("contract.docx", "contract.pdf")).toBeNull();
    expect(formatSupersede("contract.pdf", "contract.docx")).toBeNull();
    expect(formatSupersede("sheet.xlsx", "sheet.jpg")).toBeNull();
  });
  it("handles missing names safely", () => {
    expect(formatSupersede(null, "x.pdf")).toBeNull();
    expect(formatSupersede("x.pdf", undefined)).toBeNull();
  });
});

describe("categoryFromFolder", () => {
  it("maps the owner's standard category folders", () => {
    expect(categoryFromFolder("Dar Spices/03_Tax/vat.pdf")).toBe("Tax");
    expect(categoryFromFolder("Cocozuri/01_Legal-and-Registration/memarts.pdf")).toBe("Registration");
    expect(categoryFromFolder("PES/02_Licenses-and-Permits/trade.pdf")).toBe("Licence");
    expect(categoryFromFolder("Oracle/04_Banking-and-Finance/statement.pdf")).toBe("Banking");
    expect(categoryFromFolder("Terra/06_Immigration/work-permit.jpg")).toBe("Immigration");
    expect(categoryFromFolder("MES/07_Contracts-and-Leases/lease.pdf")).toBe("Contract");
    expect(categoryFromFolder("Pamoja/08_Operations-and-Branding/logo.png")).toBe("Operations");
  });
  it("reads Immigration before Licence so a work-permit folder isn't a Licence", () => {
    expect(categoryFromFolder("Co/06_Immigration/permit.pdf")).toBe("Immigration");
  });
  it("defers People-and-HR to the file content (no folder category)", () => {
    expect(categoryFromFolder("Co/05_People-and-HR/contract.pdf")).toBeNull();
  });
  it("returns null when nothing matches", () => {
    expect(categoryFromFolder("Co/random/file.pdf")).toBeNull();
    expect(categoryFromFolder("")).toBeNull();
    expect(categoryFromFolder(null)).toBeNull();
  });
});
