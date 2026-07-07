import { NextResponse } from "next/server";
import { getPortalPerson, seesAllCompanies } from "@/lib/portal-auth";
import { resolveSmartAnswer } from "@/lib/smart-answer";
import { unifiedSearch } from "@/lib/search";
import { runPortalSearch } from "@/lib/portal-search";
import { scopePortalSearchResults } from "@/lib/ori/portal-scope";

/* ------------------------------------------------------------------ *
 * Portal ORI — ASK.  POST /api/portal/ori/ask  { question }
 *
 * Gate: me.caps.oriAsk (403 otherwise). Self-scopes via cos_portal.
 *
 * SAFETY DECISION: resolveSmartAnswer is PORTFOLIO-WIDE — its resolvers
 * aggregate across every company's people / tasks / documents with no
 * scope awareness. Handing its cards to a scoped user would leak
 * cross-company counts and rows. So:
 *   • seesAllCompanies(me) (HR / portfolio director) → return the smart
 *     answer as-is (they are already allowed to see the whole portfolio).
 *   • ANY scoped viewer (manager, staff, company-scoped director) → we do
 *     NOT run the portfolio-wide answer. We return SCOPED search results
 *     (the same hard-filtered set as /search) plus a `note` explaining the
 *     answer is limited to their scope. This is the "scoped smart-answers
 *     only + a note" fallback the brief calls for — never raw RAG over
 *     everything.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const me = await getPortalPerson();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!me.caps.oriAsk) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  // Group-wide viewers may see the portfolio-wide instant answer.
  if (seesAllCompanies(me)) {
    let answer = null;
    try {
      answer = await resolveSmartAnswer(question);
    } catch {
      answer = null;
    }
    if (answer) {
      return NextResponse.json({ mode: "answer", answer }, { headers: { "cache-control": "no-store" } });
    }
    // No instant answer → fall through to scoped search results (which for a
    // group-wide viewer is the full set anyway).
  }

  // Scoped viewers: NEVER the portfolio-wide answer. Return scoped results + a note.
  const core = await runPortalSearch(question);
  let results: Awaited<ReturnType<typeof scopePortalSearchResults>> = [];
  try {
    const wide = await unifiedSearch(question, seesAllCompanies(me) ? 10 : 20);
    results = await scopePortalSearchResults(me, wide);
  } catch {
    results = [];
  }

  const note = seesAllCompanies(me)
    ? undefined
    : "Showing results within your access. ORI's instant answers cover only the companies you can see.";

  return NextResponse.json(
    { mode: "results", note, tasks: core.tasks, people: core.people, results: results.slice(0, 20) },
    { headers: { "cache-control": "no-store" } }
  );
}
