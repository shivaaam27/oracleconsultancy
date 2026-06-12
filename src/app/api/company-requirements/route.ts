import { NextRequest, NextResponse } from "next/server";
import { getCompanyChecklist } from "@/lib/company-requirements";
import { listComplianceEvents } from "@/lib/compliance-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const checklist = await getCompanyChecklist(id);
  const events = await listComplianceEvents({ type: "company", id }, 40);
  return NextResponse.json({ ...checklist, events });
}
