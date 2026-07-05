// /api/doc-passages — the AI-free passage reader for a single document.
// Returns a document's stored body text split into located passages (Page N /
// Clause 32 / Section N), optionally keyword-searched by ?q= (highlighted). Powers
// the command-palette document reader (expand-in-place). Admin-only via the edge
// gate (src/proxy.ts), same as /api/ask.

import { NextRequest, NextResponse } from "next/server";
import { getDocumentPassages, searchDocumentPassages } from "@/lib/doc-passages";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ passages: [] });
  try {
    // With a query → the matching passages (highlighted snippet). Without → the
    // first handful, so opening a result always shows something to read.
    const passages = q
      ? await searchDocumentPassages(id, q, 6)
      : (await getDocumentPassages(id)).slice(0, 6).map((p) => ({ ...p, score: 0, snippet: "" }));
    return NextResponse.json({ passages });
  } catch {
    return NextResponse.json({ passages: [] });
  }
}
