import { describe, it, expect } from "vitest";
import { canEditTask, canCompleteTask, isTaskCreator } from "./task-permissions";
import { DEFAULT_CAPS, permits } from "./portal-permissions";

/* ------------------------------------------------------------------ *
 * Who may edit a portal task.
 *
 * ⚠️ THIS EXISTS BECAUSE THE RULE WAS READ TWO DIFFERENT WAYS. Every save path
 * in `portal/actions.ts` passed the owner's configured `manageAnyTask` grant;
 * the task PAGE did not, so it fell back to the built-in "director or HR" and
 * hid the Edit button from managers the server would happily have let edit.
 * A permission answered differently by the screen and the server is not a
 * permission — these cases pin both halves to the same function.
 * ------------------------------------------------------------------ */

const someoneElses = { createdByPersonId: 99 };
const mine = { createdByPersonId: 7 };

const viewer = (portalRole: string, canManageAny?: boolean) =>
  ({ id: 7, portalRole, canManageAny });

describe("who may edit a task", () => {
  it("lets a director edit anything", () => {
    expect(canEditTask(viewer("director", true), someoneElses)).toBe(true);
    expect(canCompleteTask(viewer("director", true), someoneElses)).toBe(true);
  });

  /* The owner's decision, 28 Aug 2026: "editable by all directors and managers".
     It arrives as the configured grant, not as a hard-coded role check. */
  it("lets a manager edit anything once the grant is on", () => {
    expect(canEditTask(viewer("manager", true), someoneElses)).toBe(true);
    expect(canCompleteTask(viewer("manager", true), someoneElses)).toBe(true);
  });

  it("still lets the owner switch that grant off", () => {
    expect(canEditTask(viewer("manager", false), someoneElses)).toBe(false);
    // ...but never at the cost of a person's own task.
    expect(canEditTask(viewer("manager", false), mine)).toBe(true);
  });

  /* ⚠️ THE CREATOR RULE IS FIXED and no setting removes it — a person can always
     edit what they raised themselves. */
  it("always lets someone edit the task they raised", () => {
    expect(isTaskCreator(viewer("staff", false), mine)).toBe(true);
    expect(canEditTask(viewer("staff", false), mine)).toBe(true);
    expect(canEditTask(viewer("staff", false), someoneElses)).toBe(false);
  });

  /* ⚠️ THE FALLBACK IS WHAT BIT. With no grant passed, `canManageTask` guesses
     from the role — which is right for a director and WRONG for a manager whose
     grant is on. Any caller that omits it is reading a different rule from the
     server; this is the case that says so out loud. */
  it("falls back to director/HR when nobody passes the grant", () => {
    expect(canEditTask({ id: 7, portalRole: "director" }, someoneElses)).toBe(true);
    expect(canEditTask({ id: 7, portalRole: "hr" }, someoneElses)).toBe(true);
    expect(canEditTask({ id: 7, portalRole: "manager" }, someoneElses)).toBe(false);
  });

  it("keeps the shipped default in step with the owner's decision", () => {
    expect(DEFAULT_CAPS.manageAnyTask.manager).toBe(true);
    expect(DEFAULT_CAPS.manageAnyTask.director).toBe(true);
    expect(DEFAULT_CAPS.manageAnyTask.hr).toBe(true);
    expect(DEFAULT_CAPS.manageAnyTask.staff).toBe(false);
    expect(DEFAULT_CAPS.manageAnyTask.receptionist).toBe(false);
    // And a stored override still wins over the default, either way.
    expect(permits({ caps: { manageAnyTask: { manager: false } } }, "manager", "manageAnyTask")).toBe(false);
    expect(permits({}, "manager", "manageAnyTask")).toBe(true);
  });
});
