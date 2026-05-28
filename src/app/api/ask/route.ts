// /api/ask — RAG over the COS database.
// Given a free-form question, pulls relevant tasks/companies/people/updates
// from the DB and asks Groq to answer using that context.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";

export const maxDuration = 60; // allow up to 60s on Vercel

const SYSTEM_PROMPT = `You are the Chief of Staff for a multi-company portfolio. Answer the principal's question using ONLY the data provided in the CONTEXT below. Be specific — name people, task codes, deadlines, and companies.

STYLE:
- Direct and decision-grade. No hedging.
- British English.
- Use task codes in brackets, e.g. [DAR-007].
- If the answer is a list, use compact bullet points (one line each, no nested bullets).
- If the answer is a recommendation or summary, use 2-4 sentence prose.
- If the data doesn't contain enough information, say so plainly: "Not enough data — try X."
- Never invent task codes, names, or dates that aren't in CONTEXT.
- Keep responses under 200 words unless the question explicitly asks for detail.`;

type RawTaskRow = {
  id: number;
  code: string;
  action_item: string;
  status: string;
  priority: string;
  deadline: string | null;
  latest_update: string | null;
  escalation: string | null;
  company_id: number | null;
  created_date: string | null;
  closed_date: string | null;
  last_updated_at: string | null;
};

type EnrichedTask = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  latestUpdate: string | null;
  escalation: string | null;
  companyName: string | null;
  createdDate: string | null;
  closedDate: string | null;
};

const TASK_COLS =
  "id,code,action_item,status,priority,deadline,latest_update,escalation,company_id,created_date,closed_date,last_updated_at";

function enrich(rows: RawTaskRow[], cMap: Map<number, string>): EnrichedTask[] {
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    actionItem: t.action_item,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    latestUpdate: t.latest_update,
    escalation: t.escalation,
    companyName: t.company_id ? cMap.get(t.company_id) ?? null : null,
    createdDate: t.created_date,
    closedDate: t.closed_date,
  }));
}

async function buildContext(question: string) {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP.has(w))
    .slice(0, 10);

  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name"),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  const peopleAll = (pRows ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const cMap = new Map(companies.map((c) => [c.id, c.name]));

  const matchedCompanies = companies.filter(c =>
    tokens.some(t => c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t)
  );
  const matchedPeople = peopleAll.filter(p =>
    tokens.some(t => p.name.toLowerCase().split(/\s+/).some(w => w === t || w.startsWith(t)))
  );

  const wantsOverdue = /overdue|late|missed|behind/.test(question.toLowerCase());
  const wantsCritical = /critical|urgent|high.priority|emergency/.test(question.toLowerCase());
  const wantsEscalated = /escalat/.test(question.toLowerCase());
  const wantsClosed = /complet|done|closed|finished/.test(question.toLowerCase());

  // Build OR-of-ilikes for keyword retrieval; optional company-id constraint.
  const orFilters: string[] = [];
  if (tokens.length) {
    for (const t of tokens) orFilters.push(`action_item.ilike.%${t}%`);
  }
  for (const c of matchedCompanies) orFilters.push(`company_id.eq.${c.id}`);

  let relevantTasksRaw: EnrichedTask[] = [];
  if (orFilters.length) {
    const { data } = await sb.from("tasks").select(TASK_COLS).or(orFilters.join(",")).limit(60);
    relevantTasksRaw = enrich((data ?? []) as RawTaskRow[], cMap);
  }

  let generalTasks: EnrichedTask[] = [];
  if (relevantTasksRaw.length < 5) {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data } = await sb
      .from("tasks")
      .select(TASK_COLS)
      .gte("last_updated_at", since)
      .order("last_updated_at", { ascending: false })
      .limit(40);
    generalTasks = enrich((data ?? []) as RawTaskRow[], cMap);
  }

  // Combine, dedupe, slice
  const seen = new Set<number>();
  const allTasks = [...relevantTasksRaw, ...generalTasks].filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Apply intent filters
  const now = Date.now();
  let filtered = allTasks;
  if (wantsOverdue) {
    filtered = filtered.filter(t => t.deadline && new Date(t.deadline).getTime() < now && !["Completed", "Closed"].includes(t.status));
  }
  if (wantsCritical) {
    filtered = filtered.filter(t => t.priority === "Critical" && !["Completed", "Closed"].includes(t.status));
  }
  if (wantsEscalated) {
    filtered = filtered.filter(t => t.escalation === "Yes" || t.status === "Escalated");
  }
  if (wantsClosed) {
    filtered = filtered.filter(t => ["Completed", "Closed"].includes(t.status));
  }
  if (filtered.length === 0) filtered = allTasks;
  filtered = filtered.slice(0, 20);

  // Pull assignees + recent updates for these tasks
  const taskIds = filtered.map((t) => t.id);
  let updates: { taskId: number; body: string; createdAt: Date }[] = [];
  const assigneesByTask: Record<number, string[]> = {};

  if (taskIds.length) {
    const [{ data: updateRows }, { data: aRows }] = await Promise.all([
      sb
        .from("task_updates")
        .select("task_id,body,created_at")
        .in("task_id", taskIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(40),
      sb
        .from("task_assignees")
        .select("task_id,people(name)")
        .in("task_id", taskIds),
    ]);
    updates = (updateRows ?? []).map((u) => ({
      taskId: u.task_id as number,
      body: u.body as string,
      createdAt: new Date(u.created_at as string),
    }));
    for (const a of aRows ?? []) {
      const tid = a.task_id as number;
      const pf = (a as { people?: { name?: string } | { name?: string }[] }).people;
      const nm = Array.isArray(pf) ? pf[0]?.name : pf?.name;
      if (nm) (assigneesByTask[tid] ||= []).push(nm);
    }
  }

  return {
    today: new Date().toISOString().slice(0, 10),
    companies: companies.map(c => c.name),
    people: peopleAll.map(p => p.name),
    matchedCompanies: matchedCompanies.map(c => c.name),
    matchedPeople: matchedPeople.map(p => p.name),
    tasks: filtered.map(t => ({
      code: t.code,
      action: t.actionItem,
      status: t.status,
      priority: t.priority,
      company: t.companyName,
      assignees: assigneesByTask[t.id] || [],
      deadline: t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : null,
      escalation: t.escalation,
      latestUpdate: t.latestUpdate,
      closedDate: t.closedDate ? new Date(t.closedDate).toISOString().slice(0, 10) : null,
      daysToDeadline: t.deadline ? Math.floor((new Date(t.deadline).getTime() - now) / 86400000) : null,
      daysOpen: t.createdDate ? Math.floor((now - new Date(t.createdDate).getTime()) / 86400000) : null,
    })),
    recentUpdates: updates.slice(0, 15).map(u => ({
      taskId: filtered.find(t => t.id === u.taskId)?.code,
      body: u.body.slice(0, 200),
      createdAt: u.createdAt.toISOString().slice(0, 10),
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = (body?.question ?? "").toString().trim();
    const history: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(body?.history) ? body.history.slice(-6) : [];
    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

    const apiKey = await getGroqKey();
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured", source: "no-key" }, { status: 503 });
    }

    // For retrieval, combine the current question with the last user message
    // so follow-ups like "open it" still hit relevant data.
    const lastUserContent = [...history].reverse().find(m => m.role === "user")?.content || "";
    const retrievalQuery = `${lastUserContent} ${question}`.trim();

    const context = await buildContext(retrievalQuery);

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nUse this CONTEXT to answer follow-up questions. The conversation history is provided next.` },
      ...history,
      { role: "user", content: question },
    ];

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages,
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Ask error:", res.status, err);
      return NextResponse.json({ error: `groq-${res.status}`, detail: err.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const answer: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({
      answer,
      taskCount: context.tasks.length,
      source: "ai",
    });
  } catch (e) {
    console.error("Ask route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}

const STOP = new Set([
  "the","and","with","from","this","that","have","will","need","needs","what","when",
  "where","who","why","how","which","whose","does","did","done","are","was","were",
  "any","all","some","most","more","less","than","then","also","into","over","just",
  "only","very","much","such","still","please","tell","show","list","find","give"
]);
