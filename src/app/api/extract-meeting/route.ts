import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";

export const maxDuration = 60;

const SYSTEM_PROMPT_TMPL = (companies: string[], people: string[]) => `You are the Chief of Staff for a multi-company portfolio. The principal has just dropped raw meeting notes — bullet points, free text, fragments, sometimes minutes.

Your job: extract every action item (a thing someone needs to do) and structure each one as JSON. Skip discussion points, decisions without actions, and pleasantries.

KNOWN COMPANIES: ${companies.join(", ") || "(none)"}
KNOWN PEOPLE: ${people.join(", ") || "(none)"}

Output exactly this JSON shape (an array, even if only one or zero items):
{ "tasks": [
  {
    "actionItem": "string (imperative, 4-14 words, capitalised names)",
    "companyName": "string from KNOWN COMPANIES, or null if unclear",
    "assigneeNames": ["string from KNOWN PEOPLE, or new name if mentioned"],
    "priority": "Critical | High | Medium | Low",
    "status": "Not Started | In Progress | Under Review | Blocked | Waiting External | Escalated",
    "deadline": "ISO date YYYY-MM-DD if a specific date can be inferred, else null",
    "deadlineLabel": "human label like 'End of Week', 'Next Friday', '15 June' — or null",
    "category": "Finance | Operations | Marketing | HR | Legal | Technology | Sales | Admin | Meetings | Strategy | Other | null",
    "escalation": "Yes | No",
    "source": "verbatim quote of the original line(s) that produced this task"
  }
]}

EXTRACTION RULES:
- One action = one task. Don't merge.
- If priority words appear (urgent / critical / asap / today / blocker), set priority Critical or High.
- If status words appear (waiting, blocked, in progress, done, completed), reflect them.
- "EOM" / "end of month" / "EOW" / "by Friday" / specific dates → infer deadline date and label.
- If escalation language appears ("escalate", "Shivam to handle directly", "needs principal attention"), set escalation "Yes".
- For category: infer from keywords (invoice/payment → Finance, hire/onboard → HR, contract/legal → Legal, etc.).
- Do NOT invent assignees. Only use names mentioned in the notes.
- Today's date is ${new Date().toISOString().slice(0, 10)} — use it as the reference for relative deadlines.
- Return ONLY the JSON. No prose, no markdown fences.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const notes: string = (body?.notes ?? "").toString().trim();
    if (!notes) return NextResponse.json({ tasks: [] });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ tasks: [], source: "no-key" });
    }

    const [companies, people] = await Promise.all([
      db.select({ name: schema.companies.name }).from(schema.companies),
      db.select({ name: schema.people.name }).from(schema.people),
    ]);
    const cNames = companies.map(c => c.name);
    const pNames = people.map(p => p.name);

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT_TMPL(cNames, pNames) },
          { role: "user", content: notes },
        ],
        max_tokens: 2000,
        temperature: 0.15,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Extract meeting error:", res.status, err);
      return NextResponse.json({ tasks: [], source: "error", error: err.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim() ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ tasks: [], source: "bad-json", raw: content.slice(0, 500) }, { status: 502 });
    }

    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    // Resolve companyId / map to expected shape
    const tasksResolved = tasks.map((t: any) => {
      const company = cNames.find(c => c.toLowerCase() === (t.companyName || "").toLowerCase());
      const companyId = company ? companies[cNames.indexOf(company)] : null;
      return {
        actionItem: String(t.actionItem || "").trim(),
        companyId: companyId ? companies.find(c => c.name === company)?.name : null,
        companyName: company || null,
        assigneeNames: Array.isArray(t.assigneeNames) ? t.assigneeNames.map((n: any) => String(n).trim()).filter(Boolean) : [],
        priority: ["Critical", "High", "Medium", "Low"].includes(t.priority) ? t.priority : "Low",
        status: ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"].includes(t.status) ? t.status : "Not Started",
        deadline: t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? t.deadline : null,
        deadlineLabel: t.deadlineLabel || null,
        category: ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"].includes(t.category) ? t.category : null,
        escalation: t.escalation === "Yes" ? "Yes" : "No",
        source: t.source || null,
      };
    }).filter((t: any) => t.actionItem);

    return NextResponse.json({ tasks: tasksResolved, source: "ai" });
  } catch (e) {
    console.error("Extract meeting route error:", e);
    return NextResponse.json({ tasks: [], source: "error" }, { status: 500 });
  }
}
