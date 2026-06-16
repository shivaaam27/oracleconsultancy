// Weekly Director Brief — auto-sends the portfolio brief to the owner on the
// chosen weekday (EAT).

import type { CategoryDef } from "../runtime";
import { eatWeekday } from "../runtime";

export const directorBriefCategory: CategoryDef = {
  key: "directorBrief",
  scheduledToday: (cfg, now) => eatWeekday(now) === cfg.briefDay,
  async run(ctx) {
    const { briefEmail, briefEmailDoc } = await import("@/lib/director-brief");
    const data = await ctx.brief();
    const email = briefEmail(data);
    const r = await ctx.sendToOwner(email.subject, email.body, "automation-brief", { doc: briefEmailDoc(data) });
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
