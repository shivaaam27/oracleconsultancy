import { GROQ_FAST } from "@/lib/ai-models";
import { callGroqText } from "@/lib/ai-json";
import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";

type TaskRow = {
  id: number;
  code: string;
  action_item: string;
  status: string;
  priority: string;
  deadline: string | null;
  closed_date: string | null;
  latest_update: string | null;
  escalation: string | null;
};

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are ORI, the assistant for a multi-company portfolio (Oracle Consultancy). Given a snapshot of one company's tasks, you produce a 5-7 sentence executive briefing.

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

    const apiKey = await getGroqKey();
    if (!apiKey) return NextResponse.json({ error: "AI not configured", source: "no-key" }, { status: 503 });

    const { data: company } = await sb
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const { data: tasksRaw } = await sb
      .from("tasks")
      .select("id,code,action_item,status,priority,deadline,closed_date,latest_update,escalation")
      .eq("company_id", companyId);
    const tasks = (tasksRaw ?? []) as TaskRow[];

    const now = new Date();
    const openTasks = tasks.filter(t => !["Completed", "Closed"].includes(t.status));
    const closed = tasks.filter(t => ["Completed", "Closed"].includes(t.status));

    function dtd(t: TaskRow) {
      if (!t.deadline) return null;
      return Math.floor((new Date(t.deadline).getTime() - now.getTime()) / 86400000);
    }

    const overdue = openTasks.filter(t => { const d = dtd(t); return d !== null && d < 0; });
    const critical = openTasks.filter(t => t.priority === "Critical");
    const escalated = openTasks.filter(t => t.status === "Escalated" || t.escalation === "Yes");
    const dueThisWeek = openTasks.filter(t => { const d = dtd(t); return d !== null && d >= 0 && d <= 7; });

    const recentClosed = closed
      .filter(t => t.closed_date && (now.getTime() - new Date(t.closed_date).getTime()) < 30 * 86400000)
      .slice(0, 5);

    // Updates for this company's tasks
    const taskIds = tasks.map((t) => t.id);
    let recentUpdates: { body: string }[] = [];
    if (taskIds.length) {
      const { data: uRows } = await sb
        .from("task_updates")
        .select("body,created_at")
        .in("task_id", taskIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      recentUpdates = (uRows ?? []).map((u) => ({ body: u.body as string }));
    }

    const snapshot = {
      company: company.name,
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
        code: t.code, action: t.action_item, priority: t.priority,
        daysLate: dtd(t) ? Math.abs(dtd(t)!) : null,
        status: t.status, latestUpdate: t.latest_update,
      })),
      critical: critical.slice(0, 6).map(t => ({
        code: t.code, action: t.action_item, status: t.status,
        deadline: t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : null,
      })),
      escalated: escalated.slice(0, 6).map(t => ({
        code: t.code, action: t.action_item, latestUpdate: t.latest_update,
      })),
      recentlyClosed: recentClosed.map(t => ({ code: t.code, action: t.action_item })),
      recentUpdates: recentUpdates.map(u => ({ body: u.body.slice(0, 150) })),
    };

    const result = await callGroqText({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Write the executive briefing for this company:\n\n${JSON.stringify(snapshot, null, 2)}` },
      ],
      apiKey,
      model: GROQ_FAST,
      maxTokens: 450,
      temperature: 0.25,
    });

    if (!result.ok || !result.text) {
      console.error("Company summary error:", result.error);
      return NextResponse.json({ error: `groq-${result.error}` }, { status: 502 });
    }
    return NextResponse.json({ summary: result.text.trim(), source: "ai" });
  } catch (e) {
    console.error("Company summary route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
