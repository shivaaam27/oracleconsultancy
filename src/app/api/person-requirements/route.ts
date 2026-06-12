import { NextRequest, NextResponse } from "next/server";
import { getPersonChecklist } from "@/lib/requirements";
import { listComplianceEvents } from "@/lib/compliance-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // getPersonChecklist runs the auto-linker first (which may write events), so
  // read the trail afterwards to include any just-created auto-link entries.
  const checklist = await getPersonChecklist(id);
  if (!checklist) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const events = await listComplianceEvents({ type: "person", id }, 40);

  return NextResponse.json({ ...checklist, events });
}
