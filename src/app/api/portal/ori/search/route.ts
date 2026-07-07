import { NextResponse } from "next/server";
import { getPortalPerson, seesAllCompanies } from "@/lib/portal-auth";
import { unifiedSearch } from "@/lib/search";
import { runPortalSearch } from "@/lib/portal-search";
import { scopePortalSearchResults } from "@/lib/ori/portal-scope";

/* ------------------------------------------------------------------ *
 * Portal ORI — READ / search.  GET /api/portal/ori/search?q=…
 *
 * Gate: me.caps.oriAsk (403 otherwise). Self-scopes via the cos_portal
 * cookie (getPortalPerson inside), so it carries no admin power and is
 * excluded from the admin edge gate by the api/portal matcher in proxy.ts.
 *
 * SCOPING: two layers, both server-side and un-bypassable:
 *   1. runPortalSearch — the canonical, precisely-scoped tasks + people
 *      core (visibleTaskIds / directory company-set intersection). Reused
 *      verbatim so ORI search can never out-see the plain ⌘K overlay.
 *   2. unifiedSearch (the wider entity types: documents, vendors, assets,
 *      governance, risk, pipeline, commitments, letters, meetings) →
 *      POST-FILTERED by scopePortalSearchResults, which drops any result
 *      whose owning company isn't in companyScope(me) (and, for plain
 *      staff, keeps only results they personally own). COARSE but SAFE:
 *      unresolved ownership is EXCLUDED, never surfaced.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const me = await getPortalPerson();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!me.caps.oriAsk) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ tasks: [], people: [], results: [] }, { headers: { "cache-control": "no-store" } });
  }

  // 1) Precisely-scoped tasks + people (the same path the portal ⌘K uses).
  const core = await runPortalSearch(q);

  // 2) Wider entities via the shared deep index, then hard-scoped down. Best
  //    effort — a blip in the wide index must never break the core results.
  let results: Awaited<ReturnType<typeof scopePortalSearchResults>> = [];
  try {
    const wide = await unifiedSearch(q, seesAllCompanies(me) ? 10 : 20);
    results = await scopePortalSearchResults(me, wide);
  } catch {
    results = [];
  }

  return NextResponse.json(
    { tasks: core.tasks, people: core.people, results: results.slice(0, 20) },
    { headers: { "cache-control": "no-store" } }
  );
}
