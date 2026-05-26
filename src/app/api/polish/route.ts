import { NextRequest, NextResponse } from "next/server";
import { polishActionItem } from "@/lib/smart-parse";

const SYSTEM_PROMPT =
  "You are a Chief of Staff assistant. Rewrite action items as clear, concise business tasks. " +
  "Rules: Start with an imperative verb. Maximum 12 words. Remove filler words (please, need to, make sure, asap). " +
  "Keep names, dates, companies. Return ONLY the rewritten text, nothing else.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = (body?.text ?? "").trim();
    if (!text) return NextResponse.json({ result: "" });

    const fallback = polishActionItem(text);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ result: fallback, source: "rules" });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 60, temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", res.status, err);
      return NextResponse.json({ result: fallback, source: "rules" });
    }

    const data = await res.json();
    const aiResult: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    if (!aiResult || aiResult.length > 200 || aiResult.includes("\n")) {
      return NextResponse.json({ result: fallback, source: "rules" });
    }

    const cleaned = aiResult.replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").trim();
    return NextResponse.json({ result: cleaned, source: "ai" });

  } catch (e) {
    console.error("Polish route error:", e);
    return NextResponse.json({ result: polishActionItem(""), source: "error" });
  }
}
