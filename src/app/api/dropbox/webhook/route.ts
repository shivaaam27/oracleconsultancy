import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { syncDropbox } from "@/lib/dropbox-sync";

export const dynamic = "force-dynamic";

// Dropbox webhook. GET is the one-time verification (echo the challenge). POST
// fires when the watched folder changes — we verify the signature, then run a
// delta-sync (which pulls EVERYTHING new since the last cursor, so a missed ping
// self-heals on the next change). Respond fast.

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge") ?? "";
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.DROPBOX_APP_SECRET;
  const sig = req.headers.get("x-dropbox-signature") || "";
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  // Constant-time compare; reject anything that isn't a genuine Dropbox callback.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  // Best-effort sync; never let it hold the response (Dropbox wants a quick 200).
  await syncDropbox().catch(() => {});
  return NextResponse.json({ ok: true });
}
