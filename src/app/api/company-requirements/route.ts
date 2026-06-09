import { NextRequest, NextResponse } from "next/server";
import { getCompanyChecklist } from "@/lib/company-requirements";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const checklist = await getCompanyChecklist(id);
  return NextResponse.json(checklist);
}
