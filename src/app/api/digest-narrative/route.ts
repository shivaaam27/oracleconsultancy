import { GROQ_FAST } from "@/lib/ai-models";
import { callGroqText } from "@/lib/ai-json";
import { NextRequest, NextResponse } from "next/server";
import { getGroqKey } from "@/lib/settings";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are ORI, drafting a concise weekly executive briefing for the principal of a multi-company portfolio (Oracle Consultancy). Output a single 4-6 sentence narrative paragraph (no bullet points, no markdown headers, no greeting/signoff).

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

    const result = await callGroqText({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      model: GROQ_FAST,
      maxTokens: 350,
      temperature: 0.3,
    });

    if (!result.ok || !result.text) {
      console.error("Digest narrative error:", result.error);
      return NextResponse.json({ result: "", source: "error", error: result.error });
    }
    return NextResponse.json({ result: result.text.trim(), source: "ai" });
  } catch (e) {
    console.error("Digest narrative route error:", e);
    return NextResponse.json({ result: "", source: "error" });
  }
}
