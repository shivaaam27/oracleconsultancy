import { GROQ_FAST } from "@/lib/ai-models";
import { callGroqText } from "@/lib/ai-json";
import { NextRequest, NextResponse } from "next/server";
import { getGroqKey } from "@/lib/settings";
import { polishActionItem } from "@/lib/smart-parse";
import { loadContext } from "@/lib/ai-context";

function buildSystemPrompt(companies: string[], people: string[], recent: string[]): string {
  const companyList = companies.length ? companies.join(", ") : "(none yet)";
  const peopleList = people.length ? people.slice(0, 30).join(", ") : "(none yet)";
  const recentBlock = recent.length
    ? `\n\nYOUR RECENT TASK STYLE (mimic the tone and structure):\n${recent.slice(0, 12).map(r => `- ${r}`).join("\n")}`
    : "";

  return `You are the Chief of Staff for a multi-company business portfolio. You rewrite messy action-item notes into crisp, executive-style tasks for a task registry.

KNOWN COMPANIES: ${companyList}
KNOWN PEOPLE: ${peopleList}${recentBlock}

REWRITE RULES:
1. Start with a strong imperative verb (Follow up, Review, Resolve, Send, Schedule, Confirm, Approve, Escalate, etc.)
2. Maximum 14 words. Be concise but keep the why/what clear.
3. Capitalise names (e.g. "shivam" → "Shivam") and company names exactly as listed.
4. Remove fillers: please, kindly, make sure, just, basically, asap, urgent, eod (these go in separate priority/deadline fields, not in the text).
5. Keep numbers, dates, and concrete details intact.
6. Active voice. Prefer "Review contract" over "Contract needs to be reviewed".
7. Strip vague subjects (we / I / someone) — go straight to the verb.
8. Match the style of the recent tasks above when possible.
9. Return ONLY the rewritten action item. No quotes, no explanation, no trailing period.

EXAMPLES:
Input: need to make sure we follow up with shivam regarding the contract delay urgent
Output: Follow up with Shivam on contract delay

Input: dar spices packaging supplier has not responded yet we should check in with them
Output: Chase Dar Spices packaging supplier for response

Input: john to send updated sales report by friday eod pls
Output: Send updated sales report by Friday

Input: there is an issue with the warehouse invoice that needs resolving
Output: Resolve warehouse invoice issue

Input: can we schedule a quality inspection next week
Output: Schedule quality inspection next week`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = (body?.text ?? "").trim();
    if (!text) return NextResponse.json({ result: "" });

    const fallback = polishActionItem(text);
    const apiKey = await getGroqKey();

    if (!apiKey) {
      return NextResponse.json({ result: fallback, source: "rules", debug: "no-key" });
    }

    let systemPrompt: string;
    try {
      const ctx = await loadContext();
      systemPrompt = buildSystemPrompt(
        ctx.companies.map(c => c.name),
        ctx.people.map(p => p.name),
        ctx.recentActionItems,
      );
    } catch {
      systemPrompt = buildSystemPrompt([], [], []);
    }

    const result = await callGroqText({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      apiKey,
      model: GROQ_FAST,
      maxTokens: 80,
      temperature: 0.15,
    });

    if (!result.ok || !result.text) {
      return NextResponse.json({
        result: fallback,
        source: "rules",
        debug: `groq-${result.error}`,
      });
    }

    const aiResult: string = result.text.trim();

    if (!aiResult || aiResult.length > 200 || aiResult.includes("\n")) {
      return NextResponse.json({
        result: fallback,
        source: "rules",
        debug: "bad-ai-output",
      });
    }

    const cleaned = aiResult.replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").trim();
    return NextResponse.json({ result: cleaned, source: "ai" });

  } catch (e) {
    console.error("Polish route error:", e);
    return NextResponse.json({ result: polishActionItem(""), source: "error" });
  }
}
