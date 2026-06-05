import { NextRequest, NextResponse } from "next/server";
import { getPersonPack, type PersonPackPurpose } from "@/lib/person-pack";

export const dynamic = "force-dynamic";

const PURPOSES: PersonPackPurpose[] = [
  "document-request",
  "visa-permit",
  "recruitment",
  "task-reminder",
  "custom",
];

function parsePurpose(value: string | null): PersonPackPurpose {
  return PURPOSES.includes(value as PersonPackPurpose)
    ? (value as PersonPackPurpose)
    : "document-request";
}

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  if (!idStr) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const pack = await getPersonPack(id, parsePurpose(req.nextUrl.searchParams.get("purpose")));
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(pack);
}
