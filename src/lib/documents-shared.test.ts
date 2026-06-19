import { describe, it, expect } from "vitest";
import {
  shelfForCategory, DOC_SHELVES, SHELF_CODE, DOC_CATEGORIES,
  distinctiveTokens, pickShelf, allShelves, type CustomShelf,
} from "./documents-shared";

describe("shelfForCategory", () => {
  it("maps each known category to one of the eight shelves", () => {
    for (const cat of DOC_CATEGORIES) {
      expect(DOC_SHELVES).toContain(shelfForCategory(cat));
    }
  });

  it("routes the owner's mental model correctly", () => {
    expect(shelfForCategory("Registration")).toBe("Legal & Registration");
    expect(shelfForCategory("Licence")).toBe("Licences & Permits");
    expect(shelfForCategory("Tax")).toBe("Tax");
    expect(shelfForCategory("Banking")).toBe("Banking & Finance");
    expect(shelfForCategory("Insurance")).toBe("Banking & Finance");
    expect(shelfForCategory("Immigration")).toBe("Immigration");
    expect(shelfForCategory("Passport")).toBe("Immigration");
    expect(shelfForCategory("Lease")).toBe("Contracts & Leases");
    expect(shelfForCategory("Contract")).toBe("Contracts & Leases");
    expect(shelfForCategory("Operations")).toBe("Operations & Branding");
  });

  it("never loses an unknown or blank category", () => {
    expect(shelfForCategory(null)).toBe("Operations & Branding");
    expect(shelfForCategory("Spaceship")).toBe("Operations & Branding");
  });

  it("has a code for every shelf", () => {
    for (const shelf of DOC_SHELVES) expect(SHELF_CODE[shelf]).toMatch(/^0[1-8]$/);
  });
});

describe("distinctiveTokens", () => {
  it("keeps distinctive words and drops generic/short ones", () => {
    expect(distinctiveTokens("Trademark Registration Certificate")).toContain("trademark");
    expect(distinctiveTokens("Trademark Registration Certificate")).not.toContain("certificate");
    expect(distinctiveTokens("the and ltd for")).toEqual([]);
  });
});

describe("pickShelf / allShelves (custom shelves)", () => {
  const custom: CustomShelf[] = [{ name: "Trademarks", code: "09", keywords: ["trademark"] }];

  it("lists built-ins then custom shelves", () => {
    const list = allShelves(custom);
    expect(list).toHaveLength(DOC_SHELVES.length + 1);
    expect(list[list.length - 1]).toEqual({ name: "Trademarks", code: "09" });
  });

  it("routes to a custom shelf when its keyword matches", () => {
    expect(pickShelf({ category: "Other", title: "Trademark cert", docType: null }, custom).name).toBe("Trademarks");
  });

  it("falls back to the built-in shelf when no custom keyword matches", () => {
    expect(pickShelf({ category: "Tax", title: "VAT return", docType: null }, custom).name).toBe("Tax");
    expect(pickShelf({ category: "Tax", title: "VAT return", docType: null }, []).name).toBe("Tax");
  });
});
