import { NextRequest, NextResponse } from "next/server";
import { consumeUndo } from "@/lib/undo";
import "@/lib/undo-handlers";

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
  }
  const result = await consumeUndo(token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
