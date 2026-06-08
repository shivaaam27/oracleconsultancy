import { NextRequest, NextResponse } from "next/server";
import { getJourney, type JourneyKind } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  const kind = req.nextUrl.searchParams.get("kind") as JourneyKind | null;
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (kind !== "onboarding" && kind !== "offboarding") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const journey = await getJourney(id, kind);
  // null = no journey yet; return an explicit shape so the client can offer "Start".
  return NextResponse.json(journey ?? { kind, steps: [], total: 0, completed: 0, percent: 0 });
}
