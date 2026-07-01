import { NextRequest, NextResponse } from "next/server";
import { getAllTasks } from "@/lib/queries";
import { unifiedSearch } from "@/lib/search";
import { resolveDirectAnswer } from "@/lib/direct-answer";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase().trim();
  // History-aware: `?history=1` also surfaces archived/closed/expired records,
  // each labelled (lifecycle "history") and ranked below the live items.
  const historyParam = req.nextUrl.searchParams.get("history");
  const includeHistory = historyParam === "1" || historyParam === "true";

  // Tasks keep their rich action rows in the palette, so they're returned
  // separately from the deep-index `results`.
  const all = await getAllTasks();
  let rows = all;
  if (q) {
    rows = rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.actionItem.toLowerCase().includes(q) ||
        r.assignees.some((a) => a.toLowerCase().includes(q)) ||
        r.companyName.toLowerCase().includes(q),
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

  // Deep index across the rest of the system — only when there's a query.
  let results: Awaited<ReturnType<typeof unifiedSearch>> = [];
  // Instant, Groq-free "it just knows" answer for entity+attribute lookups
  // ("Gangadhar passport", "PES TIN") — shown at the top of the palette.
  let directAnswer: Awaited<ReturnType<typeof resolveDirectAnswer>> = null;
  if (q) {
    try {
      [results, directAnswer] = await Promise.all([
        unifiedSearch(q, 6, includeHistory),
        resolveDirectAnswer(q).catch(() => null),
      ]);
    } catch (e) {
      console.error("Unified search error:", e);
    }
  }

  return NextResponse.json({ items, results, directAnswer });
}
