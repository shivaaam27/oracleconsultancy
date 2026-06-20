// /api/ai-memory — persist and list the assistant's conversational memory.
//
//   POST { question, answer }  → recordQA("admin", question, answer)
//       Lets the STREAMING Ask COS client save the final answer once it has
//       assembled the full text (the stream path can't store it server-side).
//   GET                        → listMemories("admin")
//       Backs a future management UI (review / forget stored memories).
//
// Admin-only by posture: this route sits behind the edge admin gate in
// src/proxy.ts (the "cos_admin" cookie) exactly like /api/ask and /api/action —
// it is NOT in the matcher's exclusion list, so an unauthenticated request is
// redirected to /login before it ever reaches this handler. No extra in-route
// check is needed (and would diverge from the sibling admin api routes).
//
// Everything here is BEST-EFFORT: the memory layer swallows its own errors, so a
// storage hiccup never fails the caller's primary action.

import { NextRequest, NextResponse } from "next/server";
import { recordQA, listMemories } from "@/lib/ai-memory";

// Single owner-operator on the admin side — all admin memories share one bucket.
const MEMORY_RECIPIENT = "admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question: string = (body?.question ?? "").toString();
    const answer: string = (body?.answer ?? "").toString();
    if (!question.trim() && !answer.trim()) {
      return NextResponse.json({ error: "question or answer required" }, { status: 400 });
    }
    const ok = await recordQA(MEMORY_RECIPIENT, question, answer);
    return NextResponse.json({ ok });
  } catch (e) {
    console.error("ai-memory POST error:", e);
    // Memory is best-effort — never surface a 500 that would scare the client.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;
    const memories = await listMemories(MEMORY_RECIPIENT, limit);
    return NextResponse.json({ memories });
  } catch (e) {
    console.error("ai-memory GET error:", e);
    return NextResponse.json({ memories: [] }, { status: 200 });
  }
}
