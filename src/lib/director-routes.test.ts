import { describe, expect, it } from "vitest";
import { studioPathForDirector as to, isStaffLikeRole } from "./director-routes";

describe("studioPathForDirector", () => {
  it("sends the old home, board and tasks to the shared screens", () => {
    expect(to("/portal")).toBe("/");
    expect(to("/portal/")).toBe("/");
    expect(to("/portal/board")).toBe("/");
    expect(to("/portal/tasks")).toBe("/?tab=tasks");
  });
  it("keeps the record it was pointing at", () => {
    expect(to("/portal/task/DS-033")).toBe("/task/DS-033");
    expect(to("/portal/task/new")).toBe("/task/new");
    expect(to("/portal/people/12")).toBe("/people/12");
    expect(to("/portal/companies/3")).toBe("/companies/3");
  });
  it("maps the retired pages", () => {
    expect(to("/portal/directory")).toBe("/people");
    expect(to("/portal/meetings")).toBe("/calendar");
    expect(to("/portal/meetings", "?tab=announcements")).toBe("/announcements");
    expect(to("/portal/team")).toBe("/outbox");
    expect(to("/portal/insights")).toBe("/");
    expect(to("/portal/chat")).toBe("/");
    expect(to("/portal/whatever")).toBe("/");
  });
  it("leaves the two Studio pages that live under the portal", () => {
    expect(to("/portal/profile")).toBeNull();
    expect(to("/portal/cleaning")).toBeNull();
  });
  it("sends the removed Outbox and Insights pages to their Studio twins", () => {
    expect(to("/portal/outbox")).toBe("/outbox");
    expect(to("/portal/insights")).toBe("/");
  });
});

describe("isStaffLikeRole", () => {
  it("gives staff and the receptionist the staff screens, nobody else", () => {
    expect(isStaffLikeRole("staff")).toBe(true);
    expect(isStaffLikeRole("receptionist")).toBe(true);
    for (const r of ["manager", "director", "hr", null, undefined]) expect(isStaffLikeRole(r)).toBe(false);
  });
});
