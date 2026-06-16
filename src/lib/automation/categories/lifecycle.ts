// Probation + leave-approval reminders — a daily HR summary to the owner.

import type { CategoryDef } from "../runtime";

export const lifecycleCategory: CategoryDef = {
  key: "lifecycle",
  scheduledToday: () => true, // daily
  async run(ctx) {
    const data = await ctx.brief();
    const hr = data.hr;
    const lines: string[] = [];
    for (const p of hr.probationEnding.slice(0, 12))
      lines.push(`• Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${new Date(p.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
    for (const l of hr.pendingLeave.slice(0, 12))
      lines.push(`• Leave to approve: ${l.name} — ${l.type}, ${l.days} day${l.days === 1 ? "" : "s"} (${l.start} → ${l.end})`);

    if (lines.length === 0) return { prepared: 0, sent: 0, skipped: 0 };
    const text = `HR reminders — as at ${data.asAt}\n\n${lines.join("\n")}\n\nReview in the HR area when you can.`;
    const r = await ctx.sendToOwner("HR reminders — probation & leave", text, "automation-lifecycle");
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
