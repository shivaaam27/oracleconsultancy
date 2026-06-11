// /api/pulse — a tiny "what's happening right now" snapshot for the Oracle Intelligence chat
// to open with proactively. Cheap: one task read + today's meeting count.

import { NextResponse } from "next/server";
import { getAllTasks, computeGlobalKpis } from "@/lib/queries";
import { sb } from "@/db/supabase";

export async function GET() {
  try {
    const tasks = await getAllTasks();
    const k = computeGlobalKpis(tasks);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data: meetings } = await sb
      .from("meetings")
      .select("id,title,meeting_date")
      .gte("meeting_date", start.toISOString())
      .lte("meeting_date", end.toISOString());

    return NextResponse.json({
      overdue: k.overdue,
      dueSoon: k.dueSoon,
      critical: k.critical,
      escalated: k.escalated,
      open: k.open,
      meetingsToday: (meetings ?? []).length,
    });
  } catch (e) {
    console.error("Pulse error:", e);
    return NextResponse.json({ overdue: 0, dueSoon: 0, critical: 0, escalated: 0, open: 0, meetingsToday: 0 });
  }
}
