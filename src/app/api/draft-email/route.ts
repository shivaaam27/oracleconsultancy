import { AI_FAST } from "@/lib/ai-models";
import { callAIJson } from "@/lib/ai-json";
import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getAiKey } from "@/lib/settings";
import { wrapUntrusted } from "@/lib/prompt-safety";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are ORI, writing a professional follow-up message on behalf of the principal. You will be given a task with its action item, status, deadline, latest update, assignees, and company.

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

    const apiKey = await getAiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const { data: task } = await sb
      .from("tasks")
      .select("id,code,action_item,priority,status,deadline,latest_update,escalation,category,company_id")
      .eq("id", taskId)
      .maybeSingle();

    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    const [{ data: company }, { data: aRows }] = await Promise.all([
      task.company_id
        ? sb.from("companies").select("name").eq("id", task.company_id as number).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("task_assignees").select("people(name)").eq("task_id", taskId),
    ]);

    const companyName = company ? ((company.name as string | null) ?? null) : null;
    const assignees = (aRows ?? [])
      .map((r) => {
        const pf = (r as { people?: { name?: string } | { name?: string }[] }).people;
        return Array.isArray(pf) ? pf[0]?.name ?? null : pf?.name ?? null;
      })
      .filter((n): n is string => !!n);

    const deadlineRaw = task.deadline as string | null;
    const taskContext = {
      code: task.code,
      company: companyName,
      action: task.action_item,
      priority: task.priority,
      status: task.status,
      deadline: deadlineRaw
        ? new Date(deadlineRaw).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : null,
      latestUpdate: (task.latest_update as string | null) || null,
      assignees,
      category: task.category,
      escalation: task.escalation,
    };

    const result = await callAIJson({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Draft a follow-up email for this task:\n\n${wrapUntrusted("task data", taskContext)}` },
      ],
      apiKey,
      model: AI_FAST,
      maxTokens: 500,
      temperature: 0.3,
    });

    if (!result.ok || !result.data) {
      console.error("Draft email error:", result.error);
      return NextResponse.json({ error: `ai-${result.error}` }, { status: 502 });
    }
    const parsed = result.data;
    return NextResponse.json({
      subject: (parsed.subject as string) || "Follow-up",
      body: (parsed.body as string) || "",
      recipient: assignees.join(", ") || null,
      company: companyName,
      taskCode: task.code,
    });
  } catch (e) {
    console.error("Draft email route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
