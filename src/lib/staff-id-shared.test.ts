import { describe, it, expect } from "vitest";
import { roleLetter, categoryLetter } from "@/lib/staff-id-shared";

// Staff-ID category letters — precedence matters (Director beats all; Admin/HR
// beats Manager) and an explicit override beats the role text.

describe("roleLetter", () => {
  it("director / chief / C-suite → D", () => {
    expect(roleLetter("Managing Director")).toBe("D");
    expect(roleLetter("CFO")).toBe("D");
    expect(roleLetter("Chief Operating Officer")).toBe("D");
  });
  it("admin / HR → AH, beating manager", () => {
    expect(roleLetter("HR Officer")).toBe("AH");
    expect(roleLetter("Admin and HR Manager")).toBe("AH");
  });
  it("manager / head / lead → M", () => {
    expect(roleLetter("Operations Manager")).toBe("M");
    expect(roleLetter("Team Lead")).toBe("M");
  });
  it("anything else → E", () => {
    expect(roleLetter("Cleaner")).toBe("E");
    expect(roleLetter(null)).toBe("E");
  });
});

describe("categoryLetter", () => {
  it("explicit override wins over role text", () => {
    expect(categoryLetter("employee", "Managing Director")).toBe("E");
  });
  it("falls back to the role when no override", () => {
    expect(categoryLetter(null, "CFO")).toBe("D");
    expect(categoryLetter("", "HR Officer")).toBe("AH");
  });
});
