import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";

const KEY = "nav.recents";
const MAX = 8;

export const dynamic = "force-dynamic";

async function read(): Promise<string[]> {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {}
  return [];
}

async function write(list: string[]) {
  const value = JSON.stringify(list);
  await sb.from("settings").upsert({ key: KEY, value }, { onConflict: "key" });
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
