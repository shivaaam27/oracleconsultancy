import { NextResponse } from "next/server";
import { suggestPlan } from "@/lib/cocozuri-plan";

export const dynamic = "force-dynamic";

/**
 * What a kitchen can make, with its recipes and what is on its shelf.
 *
 * ⚠️ A ROUTE RATHER THAN A PROP, because the answer depends on WHICH kitchen —
 * and that is chosen on the form. Shipped with the page it was the first
 * kitchen's list for ever, so changing the kitchen offered the wrong shelf's
 * chocolates and the server would have accepted them.
 *
 * ⚠️ OWNER-ONLY BY DEFAULT: `/api/cocozuri/*` is NOT in the exclusion list in
 * `src/proxy.ts`, so this sits behind the admin gate. Do not add it there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const location = Number(url.searchParams.get("location"));
  if (!Number.isFinite(location) || !location) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await suggestPlan(location) });
}
