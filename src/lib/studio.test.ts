import { describe, it, expect } from "vitest";
import { STUDIO_PAGES, parseStudioPages, serializeStudioPages, isStudioOn } from "./studio";

describe("studio page switches", () => {
  it("has unique ids", () => {
    const ids = STUDIO_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads nothing from an empty or missing setting", () => {
    expect(parseStudioPages("").size).toBe(0);
    expect(parseStudioPages(null).size).toBe(0);
    expect(parseStudioPages(undefined).size).toBe(0);
  });

  it("never switches on an unknown or unfinished page", () => {
    // Nothing is ready in Phase 0, so even a hand-edited value turns nothing on.
    expect(parseStudioPages("tasks, bogus ,home").size).toBe(STUDIO_PAGES.filter((p) => p.ready && ["tasks", "home"].includes(p.id)).length);
    expect(isStudioOn("bogus", "bogus")).toBe(false);
  });

  it("stores ids in plan order and drops unknown ones", () => {
    expect(serializeStudioPages(["home", "nope", "tasks"])).toBe("tasks,home");
  });
});
