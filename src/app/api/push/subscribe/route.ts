import { NextResponse } from "next/server";
import { addSubscription, removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  await addSubscription({ endpoint: sub.endpoint, keys: sub.keys });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
