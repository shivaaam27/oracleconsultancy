import { describe, it, expect } from "vitest";
import { studioStops, stopIndexFor, studioNeighbours } from "./studio-nav";
import { NAV_ROUTES } from "./nav";

describe("studio footer order", () => {
  it("starts Home, Tasks and holds every page exactly once", () => {
    const stops = studioStops();
    expect(stops[0].id).toBe("home");
    expect(stops[1].id).toBe("tasks");
    const ids = stops.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of NAV_ROUTES) expect(ids).toContain(r.id);
    expect(stops[stops.length - 1].id).toBe("settings");
  });

  it("finds the page for an address, longest path first", () => {
    const at = (p: string, tab?: string) => studioStops()[stopIndexFor(p, tab)].id;
    expect(at("/")).toBe("home");
    expect(at("/", "tasks")).toBe("tasks");
    expect(at("/task/CC-026")).toBe("tasks");
    expect(at("/task/recurring")).toBe("recurring");
    expect(at("/hrms/leave")).toBe("leave");
    expect(at("/companies/10")).toBe("companies");
    expect(at("/nowhere")).toBe("home");
  });

  it("wraps at both ends", () => {
    expect(studioNeighbours("/").prev.id).toBe("settings");
    expect(studioNeighbours("/settings").next.id).toBe("home");
    expect(studioNeighbours("/", "tasks").next.id).toBe(studioStops()[2].id);
  });
});
