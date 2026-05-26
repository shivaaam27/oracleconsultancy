import { NextRequest, NextResponse } from "next/server";
import { polishActionItem } from "@/lib/smart-parse";
import { db, schema } from "@/db";

// Cache the context for 5 minutes so we don't hit DB on every keystroke.
let contextCache: { companies: string[]; people: string[]; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function getContext() {
  if (contextCache && Date.now() - contextCache.ts < CACHE_MS) return contextCache;
  const [companies, people] = await Promise.all([
    db.select({ name: schema.companies.name }).from(schema.companies),
    db.select({ name: schema.people.name }).from(schema.people),
  ]);
  contextCache = {
    companies: companies.map(c => c.name),
    people: people.map(p => p.name),
    ts: Date.now(),
  };
  return contextCache;
}

function buildSystemPrompt(companies: string[], people: string[]): string {
  const companyList = companies.length ? companies.join(", ") : "(none yet)";
  const peopleList = people.length ? people.slice(0, 30).join(", ") : "(none yet)";

  return `You are the Chief of Staff for a multi-company business portfolio. You rewrite messy action-item notes into crisp, executive-style tasks for a task registry.

KNOWN COMPANIES: ${companyList}
KNOWN PEOPLE: ${peopleList}

REWRITE RULES:
1. Start with a strong imperative verb (Follow up, Review, Resolve, Send, Schedule, Confirm, Approve, Escalate, etc.)
2. Maximum 14 words. Be concise but keep the why/what clear.
3. Capitalise names (e.g. "shivam" → "Shivam") and company names exactly as listed above.
4. Remove fillers: please, kindly, make sure, just, basically, asap, urgent, end of day (keep these as separate fields, not in the text).
5. Keep numbers, dates, and concrete details intact.
6. Use active voice. Prefer "Review contract" over "Contract needs to be reviewed".
7. Strip vague subjects ("we", "I", "someone") — go straight to the verb.
8. Return ONLY the rewritten action item. No quotes, no explanations, no trailing period.

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
Output: Schedule quality inspection next week

Input: review the q4 financials with the cfo
Output: Review Q4 financials with CFO`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = (body?.text ?? "").trim();
    if (!text) return NextResponse.json({ result: "" });

    const fallback = polishActionItem(text);
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ result: fallback, source: "rules", debug: "no-key" });
    }

    // Load business context (cached)
    let systemPrompt: string;
    try {
      const ctx = await getContext();
      systemPrompt = buildSystemPrompt(ctx.companies, ctx.people);
    } catch {
      systemPrompt = buildSystemPrompt([], []);
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 80,
        temperature: 0.15,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq error:", res.status, err);
      return NextResponse.json({
        result: fallback,
        source: "rules",
        debug: `groq-${res.status}`,
      });
    }

    const data = await res.json();
    const aiResult: string =
      data?.choices?.[0]?.message?.content?.trim() ?? "";

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
