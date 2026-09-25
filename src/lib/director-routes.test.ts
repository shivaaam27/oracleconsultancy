import { describe, expect, it } from "vitest";
import { studioPathForDirector as to } from "./director-routes";

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
    expect(to("/portal/chat/9")).toBe("/chat/9");
    expect(to("/portal/chat", "?dm=4")).toBe("/chat?dm=4");
  });
  it("maps the retired pages", () => {
    expect(to("/portal/directory")).toBe("/people");
    expect(to("/portal/meetings")).toBe("/calendar");
    expect(to("/portal/meetings", "?tab=announcements")).toBe("/announcements");
    expect(to("/portal/team")).toBe("/outbox");
    expect(to("/portal/insights")).toBe("/");
    expect(to("/portal/whatever")).toBe("/");
  });
  it("leaves the one page not rebuilt yet", () => {
    expect(to("/portal/profile")).toBeNull();
  });
});
