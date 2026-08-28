import { describe, it, expect } from "vitest";
import {
  PORTAL_ROLES,
  ROLE_LABEL,
  SCOPE_LEVELS,
  SCOPE_WORDS,
  CAPABILITY_GROUPS,
  DEFAULT_SCOPE,
  DEFAULT_CAPS,
  asPortalRole,
  directorScopeOf,
  scopeLevelFor,
  permits,
  resolveRolePerms,
  resolveMatrix,
  roleAfterReset,
  scopeForRole,
  type CapabilityKey,
  type PortalRoleKey,
} from "./portal-permissions";

/**
 * The portal's permission rules had NO tests, which is a strange gap for the one
 * module that decides who can see and do what. These lock today's behaviour
 * down: the defaults are asserted cell by cell, so any future edit to the matrix
 * has to be a deliberate change to this file too.
 */

const ALL_CAPS = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));

describe("the role list", () => {
  it("has a label and a default scope for every role", () => {
    for (const r of PORTAL_ROLES) {
      expect(ROLE_LABEL[r], `label for ${r}`).toBeTruthy();
      expect(DEFAULT_SCOPE[r], `scope for ${r}`).toBeTruthy();
    }
  });

  it("words every scope level, for the screens that state it rather than offer it", () => {
    for (const { value } of SCOPE_LEVELS) expect(SCOPE_WORDS[value]).toBeTruthy();
    expect(Object.keys(SCOPE_WORDS).sort()).toEqual(["all", "companies", "own"]);
  });

  it("lists every capability exactly once across the UI groups", () => {
    expect(new Set(ALL_CAPS).size).toBe(ALL_CAPS.length);
    for (const cap of ALL_CAPS) expect(DEFAULT_CAPS[cap], `defaults for ${cap}`).toBeTruthy();
  });

  it("gives every capability a value for every role — no undefined cell", () => {
    for (const cap of ALL_CAPS) {
      for (const r of PORTAL_ROLES) expect(typeof DEFAULT_CAPS[cap][r], `${cap}/${r}`).toBe("boolean");
    }
  });
});

describe("the default scope — what each level SEES", () => {
  it("is exactly today's behaviour", () => {
    expect(DEFAULT_SCOPE).toEqual({
      staff: "own",
      manager: "companies",
      hr: "all",
      director: "all",
      receptionist: "own",
    });
  });
});

describe("the default capabilities — what each level may DO", () => {
  // Written out in full on purpose. A one-cell change anywhere in the app now
  // fails here rather than silently widening somebody's access.
  const expected: Record<CapabilityKey, PortalRoleKey[]> = {
    createTasks: ["manager", "hr", "director"],
    manageAnyTask: ["manager", "hr", "director"],
    bulkTaskActions: ["manager", "hr", "director"],
    crossCompanyTasks: ["hr", "director"],
    recurringTasks: ["manager", "hr", "director"],
    messageOnTasks: ["manager", "hr", "director"],
    bulkOutreach: ["director"],
    createEvents: ["manager", "hr", "director"],
    navTasks: ["manager", "hr", "director"],
    navOutbox: ["manager", "hr", "director"],
    navInsights: ["manager", "hr", "director"],
    oriAsk: ["staff", "manager", "hr", "director"],
    oriAct: ["manager", "director"],
    cleaningLog: ["receptionist"],
    cleaningOverview: ["manager", "receptionist"],
    directorBrief: ["director"],
  };

  for (const [cap, allowed] of Object.entries(expected) as [CapabilityKey, PortalRoleKey[]][]) {
    it(`${cap} is on for ${allowed.join(", ") || "nobody"} and off for everyone else`, () => {
      for (const r of PORTAL_ROLES) {
        expect(DEFAULT_CAPS[cap][r], `${cap}/${r}`).toBe(allowed.includes(r));
      }
    });
  }

  it("never gives the receptionist a task or comms power", () => {
    const taskish: CapabilityKey[] = [
      "createTasks", "manageAnyTask", "bulkTaskActions", "crossCompanyTasks",
      "recurringTasks", "messageOnTasks", "bulkOutreach", "createEvents",
      "navTasks", "navOutbox", "navInsights", "oriAsk", "oriAct", "directorBrief",
    ];
    for (const cap of taskish) expect(DEFAULT_CAPS[cap].receptionist, cap).toBe(false);
  });

  it("never gives plain staff anything beyond asking ORI", () => {
    for (const cap of ALL_CAPS) {
      expect(DEFAULT_CAPS[cap].staff, cap).toBe(cap === "oriAsk");
    }
  });
});

describe("asPortalRole", () => {
  it("keeps every real role", () => {
    for (const r of PORTAL_ROLES) expect(asPortalRole(r)).toBe(r);
  });
  it("falls back to the LEAST powerful role for anything else", () => {
    for (const bad of [null, undefined, "", "admin", "owner", "DIRECTOR", "Manager", "0"]) {
      expect(asPortalRole(bad), String(bad)).toBe("staff");
    }
  });
});

describe("directorScopeOf — one reader for a scope stored in two places", () => {
  it("prefers the join table", () => {
    expect(directorScopeOf({ director_companies: [{ company_id: 6 }, { company_id: 2 }], director_company_id: 9 }))
      .toEqual([6, 2]);
  });
  it("accepts a single embedded object (PostgREST returns one, not an array, on a to-one embed)", () => {
    expect(directorScopeOf({ director_companies: { company_id: 5 } })).toEqual([5]);
  });
  it("falls back to the legacy column when the join table has nothing", () => {
    expect(directorScopeOf({ director_companies: [], director_company_id: 4 })).toEqual([4]);
    expect(directorScopeOf({ director_company_id: 4 })).toEqual([4]);
  });
  it("is empty — a portfolio-wide director — when neither is set", () => {
    expect(directorScopeOf({})).toEqual([]);
    expect(directorScopeOf({ director_companies: null, director_company_id: null })).toEqual([]);
  });
  it("de-duplicates", () => {
    expect(directorScopeOf({ director_companies: [{ company_id: 3 }, { company_id: 3 }] })).toEqual([3]);
  });
});

describe("the owner's overrides", () => {
  it("change nothing when the config is empty", () => {
    for (const r of PORTAL_ROLES) {
      expect(scopeLevelFor({}, r)).toBe(DEFAULT_SCOPE[r]);
      expect(scopeLevelFor(null, r)).toBe(DEFAULT_SCOPE[r]);
      for (const cap of ALL_CAPS) expect(permits({}, r, cap), `${r}/${cap}`).toBe(DEFAULT_CAPS[cap][r]);
    }
  });

  it("widen a manager's scope when asked, and only that role", () => {
    const cfg = { scope: { manager: "all" as const } };
    expect(scopeLevelFor(cfg, "manager")).toBe("all");
    expect(scopeLevelFor(cfg, "staff")).toBe("own");
    expect(scopeLevelFor(cfg, "director")).toBe("all");
  });

  it("turn one capability off for one role without touching the rest", () => {
    const cfg = { caps: { createTasks: { manager: false } } };
    expect(permits(cfg, "manager", "createTasks")).toBe(false);
    expect(permits(cfg, "director", "createTasks")).toBe(true);
    expect(permits(cfg, "manager", "createEvents")).toBe(true);
  });

  it("treat an unknown role as staff rather than throwing", () => {
    expect(scopeLevelFor({}, "wizard")).toBe("own");
    expect(permits({}, "wizard", "createTasks")).toBe(false);
  });

  it("survive a config naming a role or capability that no longer exists", () => {
    const cfg = { scope: { wizard: "all" }, caps: { flyAway: { director: true } } } as never;
    expect(scopeLevelFor(cfg, "director")).toBe("all");
    expect(permits(cfg, "director", "createTasks")).toBe(true);
  });
});

describe("resolveRolePerms / resolveMatrix", () => {
  it("agree with each other for every role", () => {
    const cfg = { scope: { manager: "all" as const }, caps: { oriAct: { hr: true } } };
    const matrix = resolveMatrix(cfg);
    for (const r of PORTAL_ROLES) {
      const one = resolveRolePerms(cfg, r);
      expect(one.scopeLevel, r).toBe(matrix.scope[r]);
      for (const cap of ALL_CAPS) expect(one.caps[cap], `${r}/${cap}`).toBe(matrix.caps[cap][r]);
    }
  });

  it("resolves every role and capability — the matrix has no holes", () => {
    const m = resolveMatrix({});
    expect(Object.keys(m.scope).sort()).toEqual([...PORTAL_ROLES].sort());
    for (const cap of ALL_CAPS) {
      expect(Object.keys(m.caps[cap]).sort(), cap).toEqual([...PORTAL_ROLES].sort());
    }
  });
});

describe("roleAfterReset — a password reset must never demote (COMPIP-01)", () => {
  it("keeps the higher level when a reset form defaults to Staff", () => {
    expect(roleAfterReset("hr", "staff")).toBe("hr");
    expect(roleAfterReset("director", "staff")).toBe("director");
    expect(roleAfterReset("manager", "staff")).toBe("manager");
  });
  it("still allows a reset to RAISE a level", () => {
    expect(roleAfterReset("staff", "manager")).toBe("manager");
    expect(roleAfterReset("manager", "director")).toBe("director");
  });
  it("leaves a same-level reset alone", () => {
    for (const r of PORTAL_ROLES) expect(roleAfterReset(r, r)).toBe(r);
  });
  it("treats Receptionist as lateral to Staff, not above it", () => {
    expect(roleAfterReset("receptionist", "staff")).toBe("staff");
    expect(roleAfterReset("staff", "receptionist")).toBe("receptionist");
  });
  it("does not let a reset move somebody between the two top levels", () => {
    // hr and director both rank "everything", so neither pulls rank on the other.
    expect(roleAfterReset("hr", "director")).toBe("director");
    expect(roleAfterReset("director", "hr")).toBe("hr");
  });
});

describe("scopeForRole — only a Director carries companies", () => {
  it("keeps a director's companies", () => {
    expect(scopeForRole("director", [3, 5])).toEqual([3, 5]);
  });
  it("clears them for every other level, so a later promotion cannot restore them", () => {
    for (const r of PORTAL_ROLES.filter((x) => x !== "director")) {
      expect(scopeForRole(r, [3, 5]), r).toEqual([]);
    }
  });
  it("drops rubbish ids and de-duplicates", () => {
    expect(scopeForRole("director", [3, 3, 0, -1, NaN, 5])).toEqual([3, 5]);
  });
  it("an empty list is a portfolio-wide director, not an error", () => {
    expect(scopeForRole("director", [])).toEqual([]);
  });
});
