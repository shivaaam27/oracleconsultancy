import { NextResponse } from "next/server";
import { seedRequirementProfiles, listRequirementProfilesWithItems } from "@/lib/requirements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Make sure the default per-type profiles exist before listing.
    await seedRequirementProfiles();
    const profiles = await listRequirementProfilesWithItems();
    return NextResponse.json({ profiles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
