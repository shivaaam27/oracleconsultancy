import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Chief of Staff for a multi-company portfolio. Given a snapshot of one company's tasks, you produce a 5-7 sentence executive briefing.

STYLE:
- Decision-grade, factual, no fluff. British English.
- Lead with the most urgent risk or pattern.
- Name people, deadlines, and specific tasks (use task codes like [ABC-001]).
- Identify recurring themes (e.g. "Supplier delays are the dominant pattern").
- End with the single most important next action for the principal.
- 120-180 words. Plain prose. No bullets, no greeting, no signoff.
- Do not invent details. Use only the data provided.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyId = Number(body?.companyId);
    if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI not configured", source: "no-key" }, { status: 503 });

    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!company.length) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.companyId, companyId));

    const now = new Date();
    const openTasks = tasks.filter(t => !["Completed", "Closed"].includes(t.status));
    const closed = tasks.filter(t => ["Completed", "Closed"].includes(t.status));

    function dtd(t: typeof tasks[number]) {
      if (!t.deadline) return null;
      return Math.floor((new Date(t.deadline).getTime() - now.getTime()) / 86400000);
    }

    const overdue = openTasks.filter(t => { const d = dtd(t); return d !== null && d < 0; });
    const critical = openTasks.filter(t => t.priority === "Critical");
    const escalated = openTasks.filter(t => t.status === "Escalated" || t.escalation === "Yes");
    const dueThisWeek = openTasks.filter(t => { const d = dtd(t); return d !== null && d >= 0 && d <= 7; });

    const recentClosed = closed
      .filter(t => t.closedDate && (now.getTime() - new Date(t.closedDate).getTime()) < 30 * 86400000)
      .slice(0, 5);

    const recentUpdates = await db
      .select({ body: schema.taskUpdates.body, createdAt: schema.taskUpdates.createdAt, taskId: schema.taskUpdates.taskId })
      .from(schema.taskUpdates)
      .innerJoin(schema.tasks, eq(schema.taskUpdates.taskId, schema.tasks.id))
      .where(eq(schema.tasks.companyId, companyId))
      .orderBy(desc(schema.taskUpdates.createdAt))
      .limit(8);

    const snapshot = {
      company: company[0].name,
      totals: {
        all: tasks.length,
        open: openTasks.length,
        closed: closed.length,
        overdue: overdue.length,
        critical: critical.length,
        escalated: escalated.length,
        dueThisWeek: dueThisWeek.length,
      },
      overdue: overdue.slice(0, 8).map(t => ({
        code: t.code, action: t.actionItem, priority: t.priority,
        daysLate: dtd(t) ? Math.abs(dtd(t)!) : null,
        status: t.status, latestUpdate: t.latestUpdate,
      })),
      critical: critical.slice(0, 6).map(t => ({
        code: t.code, action: t.actionItem, status: t.status,
        deadline: t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : null,
      })),
      escalated: escalated.slice(0, 6).map(t => ({
        code: t.code, action: t.actionItem, latestUpdate: t.latestUpdate,
      })),
      recentlyClosed: recentClosed.map(t => ({ code: t.code, action: t.actionItem })),
      recentUpdates: recentUpdates.map(u => ({ body: u.body.slice(0, 150) })),
    };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Write the executive briefing for this company:\n\n${JSON.stringify(snapshot, null, 2)}` },
        ],
        max_tokens: 450,
        temperature: 0.25,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Company summary error:", res.status, err);
      return NextResponse.json({ error: `groq-${res.status}`, detail: err.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const summary: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ summary, source: "ai" });
  } catch (e) {
    console.error("Company summary route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
