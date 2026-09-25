import { describe, expect, it } from "vitest";
import { studioPathForDirector as to, isStaffStudioPath } from "./director-routes";

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
  it("leaves the one page not rebuilt yet", () => {
    expect(to("/portal/profile")).toBeNull();
  });
});

describe("isStaffStudioPath", () => {
  it("puts the rebuilt staff pages in the Studio frame", () => {
    for (const p of ["/portal", "/portal/", "/portal/tasks", "/portal/task/TG-002", "/portal/profile", "/portal/people", "/portal/people/19", "/portal/companies", "/portal/companies/3", "/portal/meetings", "/portal/announcements"]) expect(isStaffStudioPath(p)).toBe(true);
  });
  it("leaves the pages not rebuilt yet in the old frame", () => {
    for (const p of ["/portal/directory", "/portal/task/new", "/portal/cleaning", "/portal/people/x"]) expect(isStaffStudioPath(p)).toBe(false);
  });
});
