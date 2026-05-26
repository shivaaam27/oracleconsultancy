import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const KEY = "nav.recents";
const MAX = 8;

export const dynamic = "force-dynamic";

async function read(): Promise<string[]> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const raw = rows[0]?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {}
  return [];
}

async function write(list: string[]) {
  const value = JSON.stringify(list);
  await db
    .insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function GET() {
  return NextResponse.json({ recents: await read() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const cur = await read();
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, MAX);
  await write(next);
  return NextResponse.json({ recents: next });
}
