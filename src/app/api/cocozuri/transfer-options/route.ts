import { NextResponse } from "next/server";
import { transferOptions } from "@/lib/cocozuri-transfer";

export const dynamic = "force-dynamic";

/**
 * What one shelf holds, paired to the other shelf's own row.
 *
 * ⚠️ IT IS A ROUTE RATHER THAN A PROP because the two shelves are chosen ON the
 * form — 323 items across three places is far too much to ship to the browser
 * on every page load just in case somebody opens the sheet.
 *
 * ⚠️ OWNER-ONLY BY DEFAULT: `/api/cocozuri/*` is NOT in the exclusion list in
 * `src/proxy.ts`, so this sits behind the admin gate like the rest of the
 * module. Do not add it there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || !from || !to || from === to) {
    return NextResponse.json({ pairs: [] });
  }
  return NextResponse.json({ pairs: await transferOptions(from, to) });
}
