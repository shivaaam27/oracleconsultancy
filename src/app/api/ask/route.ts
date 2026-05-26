// /api/ask — RAG over the COS database.
// Given a free-form question, pulls relevant tasks/companies/people/updates
// from the DB and asks Groq to answer using that context.

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, or, ilike, gte, inArray } from "drizzle-orm";

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

async function buildContext(question: string) {
  // Extract keyword tokens (3+ chars) for retrieval
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP.has(w))
    .slice(0, 10);

  // Always include companies + people (small lists)
  const [companies, peopleAll] = await Promise.all([
    db.select({ id: schema.companies.id, name: schema.companies.name, code: schema.companies.code }).from(schema.companies),
    db.select({ id: schema.people.id, name: schema.people.name }).from(schema.people),
  ]);

  // Match company by name token
  const matchedCompanies = companies.filter(c =>
    tokens.some(t => c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t)
  );
  const matchedPeople = peopleAll.filter(p =>
    tokens.some(t => p.name.toLowerCase().split(/\s+/).some(w => w === t || w.startsWith(t)))
  );

  // Question intent flags
  const wantsOverdue = /overdue|late|missed|behind/.test(question.toLowerCase());
  const wantsCritical = /critical|urgent|high.priority|emergency/.test(question.toLowerCase());
  const wantsEscalated = /escalat/.test(question.toLowerCase());
  const wantsClosed = /complet|done|closed|finished/.test(question.toLowerCase());

  // Pull tasks relevant to question
  const taskConditions = [];
  if (tokens.length) {
    taskConditions.push(or(...tokens.map(t => ilike(schema.tasks.actionItem, `%${t}%`))));
  }
  if (matchedCompanies.length) {
    taskConditions.push(or(...matchedCompanies.map(c => eq(schema.tasks.companyId, c.id))));
  }

  const relevantTasksRaw = taskConditions.length
    ? await db
        .select({
          id: schema.tasks.id, code: schema.tasks.code, actionItem: schema.tasks.actionItem,
          status: schema.tasks.status, priority: schema.tasks.priority,
          deadline: schema.tasks.deadline, latestUpdate: schema.tasks.latestUpdate,
          escalation: schema.tasks.escalation, companyName: schema.companies.name,
          createdDate: schema.tasks.createdDate, closedDate: schema.tasks.closedDate,
        })
        .from(schema.tasks)
        .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
        .where(or(...taskConditions))
        .limit(60)
    : [];

  // If no direct keyword match, fall back to general state slice
  let generalTasks: typeof relevantTasksRaw = [];
  if (relevantTasksRaw.length < 5) {
    const since = new Date(Date.now() - 60 * 86400000);
    generalTasks = await db
      .select({
        id: schema.tasks.id, code: schema.tasks.code, actionItem: schema.tasks.actionItem,
        status: schema.tasks.status, priority: schema.tasks.priority,
        deadline: schema.tasks.deadline, latestUpdate: schema.tasks.latestUpdate,
        escalation: schema.tasks.escalation, companyName: schema.companies.name,
        createdDate: schema.tasks.createdDate, closedDate: schema.tasks.closedDate,
      })
      .from(schema.tasks)
      .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
      .where(gte(schema.tasks.lastUpdatedAt, since))
      .orderBy(desc(schema.tasks.lastUpdatedAt))
      .limit(40);
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
  const taskIds = filtered.map(t => t.id);
  let updates: { taskId: number; body: string; createdAt: Date }[] = [];
  let assigneesByTask: Record<number, string[]> = {};

  if (taskIds.length) {
    const [updateRows, aRows] = await Promise.all([
      db
        .select({ taskId: schema.taskUpdates.taskId, body: schema.taskUpdates.body, createdAt: schema.taskUpdates.createdAt })
        .from(schema.taskUpdates)
        .where(inArray(schema.taskUpdates.taskId, taskIds))
        .orderBy(desc(schema.taskUpdates.createdAt))
        .limit(40),
      db
        .select({ taskId: schema.taskAssignees.taskId, name: schema.people.name })
        .from(schema.taskAssignees)
        .innerJoin(schema.people, eq(schema.taskAssignees.personId, schema.people.id))
        .where(inArray(schema.taskAssignees.taskId, taskIds)),
    ]);
    updates = updateRows;
    for (const a of aRows) {
      (assigneesByTask[a.taskId] ||= []).push(a.name);
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
    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured", source: "no-key" }, { status: 503 });
    }

    const context = await buildContext(question);

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
          { role: "user", content: `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nQUESTION:\n${question}` },
        ],
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
