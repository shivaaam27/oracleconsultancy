import { NextRequest, NextResponse } from "next/server";
import { getAllTasks } from "@/lib/queries";
import { unifiedSearch } from "@/lib/search";
import { resolveDirectAnswer } from "@/lib/direct-answer";
import { resolveSmartAnswer } from "@/lib/smart-answer";
import { expandTokens } from "@/lib/synonyms";

const TASK_STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "is", "with", "all", "any", "show", "list", "find"]);
function taskTokens(q: string): string[] {
  const base = q.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length >= 2 && !TASK_STOP.has(t));
  return [...new Set([...base, ...expandTokens(new Set(base))])].slice(0, 8);
}
/** Token-scored task relevance (typo-tolerant), so tasks — the most-searched
 *  entity — rank as well as everything else, instead of a crude substring filter. */
function scoreTask(r: { code: string; actionItem: string; companyName: string; assignees: string[]; latestUpdate?: string | null; category?: string | null }, tokens: string[]): number {
  const primary = r.actionItem.toLowerCase();
  const hay = `${r.code} ${r.actionItem} ${r.companyName} ${r.assignees.join(" ")} ${r.latestUpdate ?? ""} ${r.category ?? ""}`.toLowerCase();
  let s = 0, matched = 0;
  for (const t of tokens) {
    let best = 0;
    if (r.code.toLowerCase() === t) best = 60;
    else if (primary.split(/\s+/).some((w) => w === t)) best = 30;
    else if (primary.split(/\s+/).some((w) => w.startsWith(t))) best = 22;
    else if (hay.includes(t)) best = 12;
    else if (t.length >= 4 && hay.split(/[\s\-_/]+/).some((w) => w.length >= 4 && Math.abs(w.length - t.length) <= 1 && [...t].filter((ch, i) => w[i] !== ch).length <= 1)) best = 8;
    if (best > 0) matched++;
    s += best;
  }
  return matched < tokens.length ? 0 : s; // every token must land somewhere
}

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
    const tks = taskTokens(q);
    rows = tks.length
      ? all.map((r) => ({ r, s: scoreTask(r, tks) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.r)
      : [];
  } else {
    // Empty query → recent open tasks (launchpad), most recently touched first.
    rows = rows
      .filter((r) => r.status !== "Completed" && r.status !== "Closed")
      .sort((a, b) => (b.lastUpdatedAt?.getTime() ?? 0) - (a.lastUpdatedAt?.getTime() ?? 0));
  }
  const items = rows.slice(0, q ? 12 : 8).map((r) => ({
    code: r.code,
    label: r.actionItem,
    sub: r.companyName,
    href: `/task/${r.code}`,
    status: r.status,
    flag: r.flag,
  }));

  // Deep index across the rest of the system — only when there's a query.
  let results: Awaited<ReturnType<typeof unifiedSearch>> = [];
  // Instant, Groq-free "it just knows" answers — shown at the top of the palette:
  //  - directAnswer: a single VALUE ("Gangadhar passport", "PES TIN")
  //  - smartAnswer: a natural-language LIST ("who's on leave", "expiring docs",
  //    "MES overdue tasks", "how many staff") answered straight from the index.
  let directAnswer: Awaited<ReturnType<typeof resolveDirectAnswer>> = null;
  let smartAnswer: Awaited<ReturnType<typeof resolveSmartAnswer>> = null;
  if (q) {
    try {
      [results, directAnswer, smartAnswer] = await Promise.all([
        unifiedSearch(q, 12, includeHistory),
        resolveDirectAnswer(q).catch(() => null),
        resolveSmartAnswer(q).catch(() => null),
      ]);
    } catch (e) {
      console.error("Unified search error:", e);
    }
  }

  return NextResponse.json({ items, results, directAnswer, smartAnswer });
}
