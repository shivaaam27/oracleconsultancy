import { NextRequest, NextResponse } from "next/server";
import { assetsForPerson, listAssignableAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [held, available] = await Promise.all([assetsForPerson(id), listAssignableAssets()]);
  return NextResponse.json({ held, available });
}
