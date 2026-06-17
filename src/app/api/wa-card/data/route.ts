// Signed JSON feed behind a person's reminder link. The landing card
// (src/app/r/[p]/[t]) re-fetches this on tab-focus + a gentle pulse while
// visible, so the card stays current without a reload. Public but HMAC-signed
// (same gate as /api/wa-card) and excluded from the admin gate in src/proxy.ts.
import { NextResponse } from "next/server";
import { verifyWaCardToken } from "@/lib/wa-card";
import { loadWaSummary } from "@/lib/wa-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = Number(url.searchParams.get("p"));
  const sig = url.searchParams.get("t") ?? "";
  if (!Number.isInteger(personId) || personId < 0 || !verifyWaCardToken(personId, sig)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const summary = await loadWaSummary(personId);
  return NextResponse.json(summary, { headers: { "cache-control": "no-store" } });
}
