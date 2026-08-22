import { NextResponse } from "next/server";
import { counterOptions } from "@/lib/cocozuri-counter";

export const dynamic = "force-dynamic";

/**
 * What a counter can sell, with the price already worked out.
 *
 * ⚠️ A ROUTE RATHER THAN A PROP, because the price depends on three things that
 * are all chosen ON the form: which counter, which customer, and what day. A
 * price shipped with the page would be the wrong one the moment any of them
 * changed.
 *
 * ⚠️ OWNER-ONLY BY DEFAULT: `/api/cocozuri/*` is NOT in the exclusion list in
 * `src/proxy.ts`, so this sits behind the admin gate. Do not add it there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const location = Number(url.searchParams.get("location"));
  const customer = Number(url.searchParams.get("customer"));
  const date = url.searchParams.get("date") ?? undefined;
  if (!Number.isFinite(location) || !location) return NextResponse.json({ items: [] });

  return NextResponse.json({
    items: await counterOptions(location, Number.isFinite(customer) && customer ? customer : null, date),
  });
}
