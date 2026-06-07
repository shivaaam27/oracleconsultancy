import { NextRequest, NextResponse } from "next/server";
import { getPersonChecklist } from "@/lib/requirements";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const checklist = await getPersonChecklist(id);
  if (!checklist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(checklist);
}
