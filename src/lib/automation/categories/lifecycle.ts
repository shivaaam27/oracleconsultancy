// Probation + leave-approval reminders — a daily HR summary to the owner.

import type { CategoryDef } from "../runtime";
import { appBaseUrl } from "@/lib/app-url";

export const lifecycleCategory: CategoryDef = {
  key: "lifecycle",
  scheduledToday: () => true, // daily
  async run(ctx) {
    const data = await ctx.brief();
    const hr = data.hr;
    const lines: string[] = [];
    const bullets: string[] = [];
    for (const p of hr.probationEnding.slice(0, 12)) {
      const when = new Date(p.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      lines.push(`• Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${when}`);
      bullets.push(`Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${when}`);
    }
    for (const l of hr.pendingLeave.slice(0, 12)) {
      lines.push(`• Leave to approve: ${l.name} — ${l.type}, ${l.days} day${l.days === 1 ? "" : "s"} (${l.start} → ${l.end})`);
      bullets.push(`Leave to approve: ${l.name} — ${l.type}, ${l.days} day${l.days === 1 ? "" : "s"} (${l.start} → ${l.end})`);
    }

    if (lines.length === 0) return { prepared: 0, sent: 0, skipped: 0 };
    const text = `HR reminders — as at ${data.asAt}\n\n${lines.join("\n")}\n\nReview in the HR area when you can.`;
    const r = await ctx.sendToOwner("HR reminders — probation & leave", text, "automation-lifecycle", {
      doc: {
        preheader: `${bullets.length} HR item${bullets.length === 1 ? "" : "s"} need attention.`,
        title: "HR reminders",
        subtitle: `Probation & leave · as at ${data.asAt}`,
        blocks: [{ kind: "list", bullets }],
        cta: { label: "Open the HR area", url: `${appBaseUrl()}/people` },
        footerNote: "You're receiving this because the probation & leave automation is on. Manage in Settings → Email automation.",
        office: "hr",
      },
    });
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
