import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Chief of Staff writing a professional follow-up message on behalf of the principal. You will be given a task with its action item, status, deadline, latest update, assignees, and company.

You must output exactly this JSON shape and NOTHING else:
{
  "subject": "...",
  "body": "..."
}

STYLE RULES:
- Polite, direct, executive tone. British English.
- Subject line: 4-9 words, no emoji.
- Body: 2-4 short paragraphs (3-6 sentences total). No bullet points unless listing 3+ items.
- Open with a one-line context ("Following up on …" or "Quick check on …").
- Reference the deadline, status, and the latest update if relevant.
- End with a clear ask: "Could you confirm by [date]?" or "Could you share an update by EOW?"
- Sign off with "Best," only (no name — the user will add it).
- No corporate fluff ("I hope this finds you well", "circling back", "touching base").
- Use the assignee's first name in the greeting if known, otherwise "Hi team,".
- Do not invent details. Only use what's in the task data.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId = Number(body?.taskId);
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    // Load task with company, assignees, latest update
    const taskRows = await db
      .select({
        id: schema.tasks.id,
        code: schema.tasks.code,
        actionItem: schema.tasks.actionItem,
        priority: schema.tasks.priority,
        status: schema.tasks.status,
        deadline: schema.tasks.deadline,
        latestUpdate: schema.tasks.latestUpdate,
        escalation: schema.tasks.escalation,
        category: schema.tasks.category,
        companyName: schema.companies.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    if (!taskRows.length) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const task = taskRows[0];

    const assigneeRows = await db
      .select({ name: schema.people.name })
      .from(schema.taskAssignees)
      .innerJoin(schema.people, eq(schema.taskAssignees.personId, schema.people.id))
      .where(eq(schema.taskAssignees.taskId, taskId));
    const assignees = assigneeRows.map(r => r.name);

    const taskContext = {
      code: task.code,
      company: task.companyName,
      action: task.actionItem,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline ? new Date(task.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null,
      latestUpdate: task.latestUpdate || null,
      assignees,
      category: task.category,
      escalation: task.escalation,
    };

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
          { role: "user", content: `Draft a follow-up email for this task:\n\n${JSON.stringify(taskContext, null, 2)}` },
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Draft email error:", res.status, err);
      return NextResponse.json({ error: `groq-${res.status}`, detail: err.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({
        subject: parsed.subject || "Follow-up",
        body: parsed.body || "",
        recipient: assignees.join(", ") || null,
        company: task.companyName,
        taskCode: task.code,
      });
    } catch {
      return NextResponse.json({ error: "bad-json", raw: content }, { status: 502 });
    }
  } catch (e) {
    console.error("Draft email route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
