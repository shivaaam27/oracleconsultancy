import { describe, expect, it } from "vitest";
import { BACK_PARAM, returnLabel, safeReturn, withReturn, withoutReturn } from "./return-to";

describe("safeReturn", () => {
  it("accepts an in-app path, with its filters", () => {
    expect(safeReturn("/portal/tasks")).toBe("/portal/tasks");
    expect(safeReturn("/portal/tasks?f=done&q=tra")).toBe("/portal/tasks?f=done&q=tra");
    expect(safeReturn("/?tab=tasks&status=Blocked")).toBe("/?tab=tasks&status=Blocked");
  });

  it("refuses anything that could leave the site", () => {
    // A protocol-relative path IS another origin, and looks like a path.
    expect(safeReturn("//evil.example/steal")).toBeNull();
    expect(safeReturn("/\\evil.example")).toBeNull();
    expect(safeReturn("https://evil.example")).toBeNull();
    expect(safeReturn("javascript:alert(1)")).toBeNull();
    expect(safeReturn("http://localhost:3000/portal")).toBeNull();
  });

  it("refuses what is not a rooted path at all", () => {
    expect(safeReturn("portal/tasks")).toBeNull();
    expect(safeReturn("")).toBeNull();
    expect(safeReturn(null)).toBeNull();
    expect(safeReturn(undefined)).toBeNull();
  });

  it("refuses control characters and absurd lengths", () => {
    expect(safeReturn("/portal\n/tasks")).toBeNull();
    expect(safeReturn(`/portal/${"x".repeat(600)}`)).toBeNull();
  });
});

describe("withReturn", () => {
  it("carries the address you are leaving, filters and all", () => {
    expect(withReturn("/portal/task/OC-003", "/portal/tasks?f=done&q=tra")).toBe(
      `/portal/task/OC-003?${BACK_PARAM}=${encodeURIComponent("/portal/tasks?f=done&q=tra")}`
    );
  });

  it("keeps any query the record link already had", () => {
    const out = withReturn("/task/DS-001?dtab=conversation", "/?tab=tasks");
    const params = new URLSearchParams(out.split("?")[1]);
    expect(params.get("dtab")).toBe("conversation");
    expect(params.get(BACK_PARAM)).toBe("/?tab=tasks");
  });

  it("leaves the link alone when there is nothing safe to carry", () => {
    expect(withReturn("/portal/task/OC-003", null)).toBe("/portal/task/OC-003");
    expect(withReturn("/portal/task/OC-003", "//evil.example")).toBe("/portal/task/OC-003");
  });

  it("never points a record back at itself", () => {
    // A refresh dressed as a back button.
    expect(withReturn("/portal/task/OC-003", "/portal/task/OC-003?dtab=history")).toBe("/portal/task/OC-003");
  });
});

describe("withoutReturn", () => {
  it("drops only the return address", () => {
    const out = withoutReturn(new URLSearchParams(`dtab=history&${BACK_PARAM}=%2Fportal%2Ftasks&tl=A,B`));
    expect(out.get(BACK_PARAM)).toBeNull();
    expect(out.get("dtab")).toBe("history");
    expect(out.get("tl")).toBe("A,B");
  });
});

describe("returnLabel", () => {
  it("names a portal destination", () => {
    expect(returnLabel("/portal/board")).toBe("Board");
    expect(returnLabel("/portal/tasks?f=overdue")).toBe("Tasks");
    expect(returnLabel("/portal/activity")).toBe("Activity");
    expect(returnLabel("/portal")).toBe("Home");
  });

  it("names an administrator destination", () => {
    expect(returnLabel("/hrms/assets")).toBe("Assets, Tools & Vendors");
    expect(returnLabel("/hrms/commitments")).toBe("Commitments");
    // Longest match wins: /notes/21 is still "Notes", not the last segment.
    expect(returnLabel("/notes")).toBe("Notes");
  });

  it("reads the administrator's home by its tab", () => {
    expect(returnLabel("/?tab=tasks")).toBe("Tasks");
    expect(returnLabel("/?tab=companies")).toBe("Companies");
    expect(returnLabel("/")).toBe("Home");
  });

  it("gives a sub-page the name of the section it belongs to", () => {
    expect(returnLabel("/companies/7")).toBe("Companies");
    expect(returnLabel("/hrms/assets/12")).toBe("Assets, Tools & Vendors");
  });

  it("falls back to the last word of a path nothing owns, ignoring ids", () => {
    expect(returnLabel("/somewhere/new-thing")).toBe("New thing");
    expect(returnLabel("/somewhere/new-thing/42")).toBe("New thing");
    expect(returnLabel("/")).toBe("Home");
  });
});
