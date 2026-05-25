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
    rows = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed").slice(0, 20);
  }
  const items = rows.slice(0, 12).map((r) => ({
    code: r.code,
    label: r.actionItem,
    sub: r.companyName,
    href: `/task/${r.code}`,
  }));
  return NextResponse.json({ items });
}
