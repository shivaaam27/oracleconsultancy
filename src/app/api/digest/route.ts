import { NextRequest, NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";
import { getScopedCompanyId } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * Returns the weekly digest (plain-text + narrative stats) for Ask COS.
 * Body: { company?: string } — narrow to one company by name. When omitted,
 * falls back to the active company scope cookie (group-wide if none).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companyName: string | null = typeof body?.company === "string" && body.company.trim() ? body.company.trim() : null;

    const scopedId = companyName ? null : await getScopedCompanyId();
    const digest = await buildDigest({ companyId: scopedId, companyName });

    return NextResponse.json(digest);
  } catch (e) {
    console.error("Digest route error:", e);
    return NextResponse.json({ error: "Could not build digest" }, { status: 500 });
  }
}
