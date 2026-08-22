import { NextResponse } from "next/server";
import { returnOptions } from "@/lib/cocozuri-return";

export const dynamic = "force-dynamic";

/**
 * What one shelf carries, for booking goods back onto it.
 *
 * ⚠️ A ROUTE RATHER THAN A PROP, for the same reason as the transfer's: the
 * shelf is chosen ON the form, and 323 items across three places is far too much
 * to ship to the browser on every page load just in case somebody opens the
 * sheet.
 *
 * ⚠️ OWNER-ONLY BY DEFAULT: `/api/cocozuri/*` is NOT in the exclusion list in
 * `src/proxy.ts`, so this sits behind the admin gate like the rest of the
 * module. Do not add it there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const location = Number(url.searchParams.get("location"));
  if (!Number.isFinite(location) || !location) return NextResponse.json({ items: [] });

  const rows = await returnOptions(location);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.item.id,
      name: r.name,
      uom: r.item.uom,
      productId: r.item.productId,
      batches: r.batches,
    })),
  });
}
