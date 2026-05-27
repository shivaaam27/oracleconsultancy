import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";

const KEY = "task.savedViews";

export type SavedView = {
  id: string;
  name: string;
  query: string;
};

export const dynamic = "force-dynamic";

async function readViews(): Promise<SavedView[]> {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter(
        (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
      );
  } catch {}
  return [];
}

async function writeViews(views: SavedView[]) {
  const value = JSON.stringify(views);
  await sb.from("settings").upsert({ key: KEY, value }, { onConflict: "key" });
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
