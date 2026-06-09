import { NextResponse } from "next/server";
import { listJourneyTemplates } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Seeds the per-type defaults on first call, then returns them grouped.
    const groups = await listJourneyTemplates();
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
