import { NextRequest, NextResponse } from "next/server";
import { getPersonPack, type PersonPackPurpose } from "@/lib/person-pack";
import { isPersonPackPurpose } from "@/lib/person-pack-shared";
import { getPackPrefs } from "@/lib/person-pack-prefs";

export const dynamic = "force-dynamic";

function parsePurpose(value: string | null): PersonPackPurpose {
  return isPersonPackPurpose(value) ? value : "document-request";
}

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const purpose = parsePurpose(req.nextUrl.searchParams.get("purpose"));
  const pack = await getPersonPack(id, purpose);
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const savedPrefs = await getPackPrefs(id, purpose);
  return NextResponse.json({ ...pack, savedPrefs });
}
