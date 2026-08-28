import { describe, it, expect } from "vitest";
import { portalNavGroups, portalNavItems, isPortalItemActive, type PortalTabOverrides } from "./portal-nav";

/* ------------------------------------------------------------------ *
 * The portal rail, for EVERY role.
 *
 * ⚠️ THIS TEST EXISTS BECAUSE THE RAIL NOW HAS TWO STRUCTURAL PROMISES, and
 * both are silent when they break:
 *
 *   1. `More` is PINNED to the foot of the sidebar. `portal-sidebar.tsx` finds
 *      it by label and pulls it out of the scroll. A role whose More group came
 *      back empty would simply have no pinned foot — no error, no warning, just
 *      Profile missing from where everybody else's is.
 *   2. The page's filters hang off the ACTIVE tab. A role with no active tab on
 *      a page falls back to the foot of the scroll instead, which is right but
 *      is a different screen — so which tab is active for which role matters.
 *
 * The owner asked, in as many words, that all of this hold "for all portals
 * based on permissions and roles". This is that, checked rather than claimed.
 * ------------------------------------------------------------------ */

const ROLES = ["director", "manager", "hr", "receptionist", "staff", undefined] as const;

/** The tab overrides the layout can pass — every combination that matters is
 *  "the owner turned this one off", so test the extremes. */
const OVERRIDE_CASES: (PortalTabOverrides | undefined)[] = [
  undefined,
  { tasks: false, outbox: false, insights: false, cleaning: false },
  { tasks: true, outbox: true, insights: true, cleaning: true },
];

describe("the portal rail, per role", () => {
  it("always ends with More, so the pinned foot is never empty", () => {
    for (const role of ROLES) {
      for (const overrides of OVERRIDE_CASES) {
        const groups = portalNavGroups(role, overrides);
        const more = groups.find((g) => g.label === "More");
        expect(more, `${role ?? "no role"} must have a More group to pin`).toBeTruthy();
        expect(more!.items.length).toBeGreaterThan(0);
        expect(groups.at(-1)?.label, `${role ?? "no role"}: More must be last`).toBe("More");
      }
    }
  });

  it("gives every role a Profile, wherever else it takes them", () => {
    // `profile: true` is unconditional in portalCapabilities, and the pinned
    // foot leans on that: it is what guarantees More is never empty.
    for (const role of ROLES) {
      for (const overrides of OVERRIDE_CASES) {
        const ids = portalNavItems(role, overrides).map((i) => i.id);
        expect(ids, `${role ?? "no role"} must keep Profile`).toContain("profile");
      }
    }
  });

  it("keeps the groups in one order and never invents one", () => {
    for (const role of ROLES) {
      const labels = portalNavGroups(role).map((g) => g.label);
      expect(labels).toEqual(["Work", "People", "More"].filter((l) => labels.includes(l)));
    }
  });

  it("files every visible destination in exactly one group", () => {
    for (const role of ROLES) {
      const items = portalNavItems(role);
      const grouped = portalNavGroups(role).flatMap((g) => g.items);
      expect(grouped.length).toBe(items.length);
      expect(new Set(grouped.map((i) => i.id)).size).toBe(items.length);
    }
  });

  /* ⚠️ THE ONE THAT CAUGHT A REAL BUG. Staff and HR have no Tasks TAB — it is
   * management-only — so their task list lives on Home, housed, which means the
   * list is rendered `bare`. The filter loan skipped bare lists at first, so
   * exactly the people who never see the Tasks page kept the extra column.
   * If `tasks` ever becomes visible to staff by default, or Home stops being
   * their task page, this is the line that should make somebody look. */
  it("puts a staff member's tasks on Home, not on a Tasks tab", () => {
    const staff = portalNavItems("staff").map((i) => i.id);
    expect(staff).toContain("home");
    expect(staff).not.toContain("tasks");
    // ...and Home is the tab that owns the page, so the filters hang off it.
    const home = portalNavItems("staff").find((i) => i.id === "home")!;
    expect(isPortalItemActive(home, "/portal")).toBe(true);
  });

  it("puts a director on the Board, with Tasks as a real tab", () => {
    const director = portalNavItems("director").map((i) => i.id);
    expect(director).toContain("board");
    expect(director).toContain("tasks");
    expect(director).not.toContain("home");
  });

  /* A receptionist loses Chat and Directory, which empties the People group.
   * An empty group drops out rather than rendering a heading over nothing — and
   * More must STILL be last, or the pin breaks for them alone. */
  it("drops an empty group without disturbing the pinned foot", () => {
    const groups = portalNavGroups("receptionist");
    expect(groups.some((g) => g.label === "People")).toBe(false);
    expect(groups.at(-1)?.label).toBe("More");
  });

  it("lets the owner's tab settings override the role, without emptying More", () => {
    const groups = portalNavGroups("director", {
      tasks: false, outbox: false, insights: false, cleaning: false,
    });
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain("tasks");
    expect(ids).not.toContain("insights");
    expect(groups.at(-1)?.label).toBe("More");
  });
});
