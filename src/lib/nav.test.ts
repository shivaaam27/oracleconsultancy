import { describe, it, expect } from "vitest";
import {
  MODULES,
  MODULE_BY_ID,
  NAV_ROUTES,
  NAV_GROUPS,
  ROUTE_BY_ID,
  SYSTEM_GROUP,
  moduleForPath,
  moduleGroups,
  moduleOwnGroups,
  moduleQuick,
  systemItems,
  ungroupedRouteIds,
  resolveRouteId,
  LEGACY_ROUTE_IDS,
  DEFAULT_PINS,
} from "./nav";

/* ------------------------------------------------------------------ *
 * The navigation map.
 *
 * ⚠️ THIS TEST IS THE REASON THE MODULE SPLIT IS SAFE TO CHANGE. A page that
 * falls out of every module does not throw and does not look broken — it simply
 * stops appearing in the sidebar, and nobody notices until they go looking for
 * it. That is exactly how Chat, the Director Brief and the Applications board
 * went missing the last time this app had two maps of itself.
 *
 * So: every route is filed exactly once, every module's home is real, and the
 * whole-app grouping stays derived from the modules rather than written twice.
 * ------------------------------------------------------------------ */

const moduleIds = MODULES.flatMap((m) => m.groups.flatMap((g) => g.ids));
const filedIds = [...moduleIds, ...SYSTEM_GROUP.ids];

describe("every page has a home", () => {
  it("files every route in exactly one place", () => {
    const counts = new Map<string, number>();
    for (const id of filedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const twice = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(twice, "a route filed under two modules appears twice in the rail").toEqual([]);

    const missing = NAV_ROUTES.map((r) => r.id).filter((id) => !counts.has(id));
    expect(missing, "a route in no module is reachable only by typing its address").toEqual([]);
  });

  it("files nothing that is not a real route", () => {
    const unknown = filedIds.filter((id) => !ROUTE_BY_ID[id]);
    expect(unknown, "a module names an id that no route has").toEqual([]);
  });

  it("agrees with ungroupedRouteIds(), the build-time net", () => {
    expect(ungroupedRouteIds()).toEqual([]);
  });

  it("keeps the whole-app grouping derived from the modules", () => {
    // The mobile launcher renders NAV_GROUPS. If it were written out by hand it
    // would drift, and a phone would show a different app from a laptop.
    const fromGroups = NAV_GROUPS.flatMap((g) => g.ids).sort();
    expect(fromGroups).toEqual([...filedIds].sort());
  });
});

describe("the modules themselves", () => {
  it("gives every module a real home", () => {
    for (const m of MODULES) {
      expect(m.home.startsWith("/"), `${m.id} home must be a path`).toBe(true);
    }
  });

  it("has exactly one fallback module", () => {
    const fallbacks = MODULES.filter((m) => m.match.length === 0);
    expect(fallbacks.map((m) => m.id)).toEqual(["tasks"]);
  });

  it("keeps System out of the modules, so Settings is never buried", () => {
    for (const id of SYSTEM_GROUP.ids) {
      expect(moduleIds, `${id} belongs to the whole app, not one module`).not.toContain(id);
    }
  });

  it("gives every built module a rail, and every 'soon' module none", () => {
    // A tile marked "Being built" must not appear in the sidebar, and a built one
    // must not be an empty column. CocoZuri crossed from one to the other when
    // Phase 1 landed, which is exactly the transition this guards.
    for (const m of MODULES) {
      if (m.soon) expect(m.groups, `${m.id} is not built, so it has no rail`).toEqual([]);
      else expect(m.groups.length, `${m.id} is built, so it needs a rail`).toBeGreaterThan(0);
    }
  });
});

describe("working out which module you are in", () => {
  it("matches a module by its address", () => {
    expect(moduleForPath("/recruitment").id).toBe("recruitment");
    expect(moduleForPath("/recruitment/orders/JO-2608-01").id).toBe("recruitment");
    expect(moduleForPath("/ledger/reports/trial-balance").id).toBe("ledger");
    expect(moduleForPath("/projects/12/budget").id).toBe("projects");
  });

  it("falls back to Task Management rather than an empty rail", () => {
    // ⚠️ The point of the fallback: a page nobody filed still gets a sidebar.
    expect(moduleForPath("/").id).toBe("tasks");
    expect(moduleForPath("/notes/21").id).toBe("tasks");
    expect(moduleForPath("/some/page/invented/tomorrow").id).toBe("tasks");
  });

  it("does not match a prefix that is only a word-start", () => {
    // "/ledgerish" is not inside "/ledger".
    expect(moduleForPath("/ledgerish").id).toBe("tasks");
  });

  it("always ends a rail with System", () => {
    for (const m of MODULES.filter((x) => !x.soon)) {
      const groups = moduleGroups(m);
      expect(groups.at(-1)?.label, `${m.id} must keep System at the foot`).toBe("System");
    }
  });

  // The rail renders these two separately — the module's pages scroll, System
  // stays pinned at the foot. Together they must still be the whole rail, or a
  // page would be reachable from the old list and from neither of the new ones.
  it("splits the rail into the module's own groups plus a pinned System", () => {
    expect(systemItems().length).toBe(SYSTEM_GROUP.ids.length);
    for (const m of MODULES.filter((x) => !x.soon)) {
      const own = moduleOwnGroups(m);
      expect(own.some((g) => g.label === "System"), `${m.id} must not scroll System`).toBe(false);
      expect(own.length + 1).toBe(moduleGroups(m).length);
    }
  });

  /* ⚠️ A launcher shortcut must name a page INSIDE the module whose tile it sits
   * on. Otherwise a tile quietly becomes a door into somewhere else, and the
   * whole point of the split — that the rail shows the module you are in — is
   * broken by the screen you used to get there. */
  it("keeps every launcher shortcut inside its own module", () => {
    for (const m of MODULES) {
      const mine = new Set(m.groups.flatMap((g) => g.ids));
      for (const id of m.quick ?? []) {
        expect(ROUTE_BY_ID[id], `${m.id}: quick link "${id}" is not a real route`).toBeTruthy();
        expect(mine.has(id), `${m.id}: quick link "${id}" belongs to another module`).toBe(true);
      }
      expect(moduleQuick(m).length).toBe((m.quick ?? []).length);
    }
  });
});

describe("what must not break", () => {
  it("keeps every default pin pointing at a real route", () => {
    for (const id of DEFAULT_PINS) expect(ROUTE_BY_ID[resolveRouteId(id)]).toBeTruthy();
  });

  it("follows a renamed id to its new page", () => {
    // Pins are stored as ids and unknown ones are DROPPED on load, so a rename
    // without a line here silently un-pins whatever the owner had pinned.
    for (const [oldId, newId] of Object.entries(LEGACY_ROUTE_IDS)) {
      expect(ROUTE_BY_ID[newId], `${oldId} redirects to ${newId}, which must exist`).toBeTruthy();
      expect(resolveRouteId(oldId)).toBe(newId);
    }
  });

  it("has no two routes sharing an address", () => {
    const hrefs = NAV_ROUTES.map((r) => r.href);
    expect(hrefs.length).toBe(new Set(hrefs).size);
  });
});
