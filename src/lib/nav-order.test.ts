import { describe, expect, it } from "vitest";
import { applyNavOrder, moveNavStop } from "./nav-order";

const S = [
  { id: "home", group: "Work" }, { id: "tasks", group: "Work" }, { id: "notes", group: "Work" }, { id: "outbox", group: "Work" },
  { id: "people", group: "Records" }, { id: "companies", group: "Records" },
  { id: "settings", group: "System" },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("applyNavOrder", () => {
  it("leaves the natural order alone when nothing is saved", () => {
    expect(ids(applyNavOrder(S, []))).toEqual(ids(S));
  });
  it("sorts within each group and keeps the groups in place", () => {
    expect(ids(applyNavOrder(S, ["outbox", "tasks", "notes", "companies", "people"]))).toEqual(
      ["home", "outbox", "tasks", "notes", "companies", "people", "settings"]);
  });
  it("keeps Home first whatever was saved", () => {
    expect(ids(applyNavOrder(S, ["tasks", "home"]))[0]).toBe("home");
  });
  it("puts a page the saved list never saw after the known ones, in its natural order", () => {
    expect(ids(applyNavOrder(S, ["notes"])).slice(0, 4)).toEqual(["home", "notes", "tasks", "outbox"]);
  });
});

describe("moveNavStop", () => {
  it("moves a page one step within its group", () => {
    expect(moveNavStop(S, "notes", -1)?.slice(0, 4)).toEqual(["home", "notes", "tasks", "outbox"]);
  });
  it("never moves past Home or across a group", () => {
    expect(moveNavStop(S, "tasks", -1)).toBeNull();
    expect(moveNavStop(S, "outbox", 1)).toBeNull();
    expect(moveNavStop(S, "home", 1)).toBeNull();
  });
});
