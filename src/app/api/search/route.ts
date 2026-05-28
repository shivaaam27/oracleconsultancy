import { NextRequest, NextResponse } from "next/server";
import { getAllTasks } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase().trim();
  const all = await getAllTasks();
  let rows = all;
  if (q) {
    rows = rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.actionItem.toLowerCase().includes(q) ||
        r.assignees.some((a) => a.toLowerCase().includes(q)) ||
        r.companyName.toLowerCase().includes(q)
    );
  } else {
    // Empty query → recent open tasks (launchpad), most recently touched first.
    rows = rows
      .filter((r) => r.status !== "Completed" && r.status !== "Closed")
      .sort((a, b) => (b.lastUpdatedAt?.getTime() ?? 0) - (a.lastUpdatedAt?.getTime() ?? 0));
  }
  const items = rows.slice(0, q ? 8 : 6).map((r) => ({
    code: r.code,
    label: r.actionItem,
    sub: r.companyName,
    href: `/task/${r.code}`,
    status: r.status,
    flag: r.flag,
  }));
  return NextResponse.json({ items });
}
