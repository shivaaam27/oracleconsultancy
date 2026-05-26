import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const KEY = "nav.pinned";
const DEFAULT_PINS = ["capture", "digest", "outbox", "task", "people"];

export const dynamic = "force-dynamic";

async function readPins(): Promise<string[]> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const raw = rows[0]?.value;
  if (!raw) return DEFAULT_PINS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {}
  return DEFAULT_PINS;
}

export async function GET() {
  const pins = await readPins();
  return NextResponse.json({ pins });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const pins = body?.pins;
  if (!Array.isArray(pins) || !pins.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "pins must be string[]" }, { status: 400 });
  }
  const value = JSON.stringify(pins);
  await db
    .insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return NextResponse.json({ pins });
}
