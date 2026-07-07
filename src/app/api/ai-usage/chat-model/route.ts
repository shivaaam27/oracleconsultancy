// POST /api/ai-usage/chat-model — persist the ORI chat model picker's choice.
// Admin-gated by the edge proxy. Body: { model: "auto" | <CHAT_MODELS id> }.
// Validates against CHAT_MODELS (anything else → "auto") so a stale/invalid value
// can never pin a non-existent model — the ask path already fails open to Auto.

import { NextRequest, NextResponse } from "next/server";
import { saveAppSettings } from "@/lib/settings";
import { CHAT_MODELS } from "@/lib/ai-models";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { model?: unknown };
    const raw = typeof body.model === "string" ? body.model : "auto";
    const model = raw === "auto" || CHAT_MODELS.includes(raw) ? raw : "auto";
    await saveAppSettings({ chatModel: model });
    return NextResponse.json({ ok: true, model });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
