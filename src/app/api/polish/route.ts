import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { polishActionItem } from "@/lib/smart-parse";

const SYSTEM_PROMPT = `You are a Chief of Staff assistant. Your only job is to rewrite action items into clear, professional, concise business tasks.

Rules:
- Always start with an imperative verb (Review, Send, Follow up, Schedule, Resolve, etc.)
- Maximum 12 words
- Remove all filler words (please, kindly, need to, make sure, asap, etc.)
- Keep specific names, dates, and company references
- Return ONLY the rewritten action item — no explanation, no punctuation at end, no quotes`;

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ result: "" });

  // Rule-based result as instant fallback
  const fallback = polishActionItem(text);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ result: fallback });

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.trim() },
      ],
      max_tokens: 60,
      temperature: 0.2,
    });

    const result = completion.choices[0]?.message?.content?.trim() ?? "";
    // Sanity check — if AI returns something weird, fall back to rule-based
    if (!result || result.length > 200 || result.includes("\n")) {
      return NextResponse.json({ result: fallback });
    }

    // Strip any trailing punctuation the model adds
    const cleaned = result.replace(/[.!?]+$/, "").trim();
    return NextResponse.json({ result: cleaned });
  } catch {
    return NextResponse.json({ result: fallback });
  }
}
