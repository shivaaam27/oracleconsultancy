import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const KEY = "task.savedViews";

export type SavedView = {
  id: string;
  name: string;
  // Encoded URL query string for /task — e.g. "company=Dar+Spices&priority=Critical"
  query: string;
};

export const dynamic = "force-dynamic";

async function readViews(): Promise<SavedView[]> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const raw = rows[0]?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string");
  } catch {}
  return [];
}

async function writeViews(views: SavedView[]) {
  const value = JSON.stringify(views);
  await db
    .insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function GET() {
  const views = await readViews();
  return NextResponse.json({ views });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const views = body?.views;
  if (!Array.isArray(views)) return NextResponse.json({ error: "views must be array" }, { status: 400 });
  await writeViews(views);
  return NextResponse.json({ views });
}
