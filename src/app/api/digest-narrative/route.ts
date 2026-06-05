import { NextRequest, NextResponse } from "next/server";
import { getGroqKey } from "@/lib/settings";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Chief of Staff drafting a concise weekly executive briefing for the principal of a multi-company portfolio (Oracle Consultancy). Output a single 4-6 sentence narrative paragraph (no bullet points, no markdown headers, no greeting/signoff).

STYLE:
- Direct, factual, decision-grade. No fluff, no hedging, no "as we discussed".
- Lead with the most urgent risk. Group by company when natural.
- Name people and companies explicitly. Use numbers from the data.
- End with the single most important action the principal should take this week.
- British English. No emojis. No first-person ("I", "we").
- 100-160 words. Plain prose suitable for forwarding via email.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const stats = body?.stats;
    if (!stats) return NextResponse.json({ result: "" }, { status: 400 });

    const apiKey = await getGroqKey();
    if (!apiKey) {
      return NextResponse.json({ result: "", source: "no-key" });
    }

    const userPrompt = `Here are this week's stats. Write the narrative.

${JSON.stringify(stats, null, 2)}`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Digest narrative error:", res.status, err);
      return NextResponse.json({ result: "", source: "error", error: err.slice(0, 500) });
    }

    const data = await res.json();
    const aiResult: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ result: aiResult, source: "ai" });
  } catch (e) {
    console.error("Digest narrative route error:", e);
    return NextResponse.json({ result: "", source: "error" });
  }
}
