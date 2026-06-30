import { runPortalSearch } from "@/lib/portal-search";

/* ------------------------------------------------------------------ *
 * Scoped portal search endpoint (Ctrl+K / ⌘K overlay).
 *
 * A lightweight Route Handler — NOT a server action — so a keystroke
 * never re-renders the (force-dynamic) portal page. runPortalSearch
 * self-scopes via the cos_portal cookie (getPortalPerson inside), so
 * there's no extra auth here: an unauthenticated caller falls through
 * the EMPTY guard and gets { tasks: [], people: [] }.
 *
 * Excluded from the admin edge gate by the api/portal matcher exclusion
 * in src/proxy.ts, so portal users reach it carrying only cos_portal.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const result = await runPortalSearch(q);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
