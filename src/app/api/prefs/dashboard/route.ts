import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { normaliseLayout } from "@/lib/dashboard";

const KEY = "dashboard.layout";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {}
  }
  return NextResponse.json(normaliseLayout(parsed));
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const layout = normaliseLayout(body);
  const { error } = await sb
    .from("settings")
    .upsert({ key: KEY, value: JSON.stringify(layout) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(layout);
}
