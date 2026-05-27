import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";

const KEY = "nav.pinned";
const DEFAULT_PINS = ["capture", "digest", "outbox", "task", "people"];

export const dynamic = "force-dynamic";

async function readPins(): Promise<string[]> {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
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
  const { error } = await sb
    .from("settings")
    .upsert({ key: KEY, value }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pins });
}
