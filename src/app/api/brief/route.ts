// /api/brief — a deterministic "Today" briefing for the assistant. No AI, so it
// always works and degrades gracefully: counts of what needs attention plus the
// few most urgent items, computed from the live task data.

import { NextResponse } from "next/server";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";

export const dynamic = "force-dynamic";

const URGENCY: Record<string, number> = {
  "escalate-now": 0, overdue: 1, escalated: 2, stalled: 3, "due-soon": 4,
};

export async function GET() {
  try {
    const all = await getAllTasks();
    const open = all.filter((r) => isOpen(r.status));

    const counts = {
      open: open.length,
      overdue: open.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
      dueSoon: open.filter((r) => r.flag === "due-soon").length,
      escalated: open.filter((r) => r.flag === "escalated" || r.status === "Escalated" || r.escalation === "Yes").length,
      stalled: open.filter((r) => r.flag === "stalled").length,
      noOwner: open.filter((r) => r.assignees.length === 0).length,
      critical: open.filter((r) => r.priority === "Critical").length,
    };

    // The handful of items that actually need a decision now.
    const top = open
      .filter((r) =>
        r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "stalled" ||
        r.flag === "escalated" || r.status === "Escalated" ||
        (r.priority === "Critical" && r.flag !== "on-track"))
      .map((r) => ({
        code: r.code,
        company: r.companyName,
        title: r.actionItem,
        flag: r.flag,
        priority: r.priority,
        dtd: typeof r.daysToDeadline === "number" ? r.daysToDeadline : null,
      }))
      .sort((a, b) => {
        const ua = URGENCY[a.flag] ?? 5;
        const ub = URGENCY[b.flag] ?? 5;
        if (ua !== ub) return ua - ub;
        return (a.dtd ?? 9999) - (b.dtd ?? 9999);
      })
      .slice(0, 4);

    return NextResponse.json({ generatedAt: new Date().toISOString(), counts, top });
  } catch {
    return NextResponse.json({ error: "brief-failed" }, { status: 500 });
  }
}
