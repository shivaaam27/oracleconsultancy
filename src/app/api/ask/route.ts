// /api/ask — RAG over the COS database.
// Given a free-form question, pulls relevant tasks/companies/people/updates
// from the DB and asks Groq to answer using that context.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";
import { listDocuments, deriveDocStatus, daysToExpiry } from "@/lib/documents";
import { buildCompanyComplianceScores, buildPersonComplianceScores, worstComplianceScores } from "@/lib/compliance";
import { normalizePersonType } from "@/lib/person-types";

export const maxDuration = 60; // allow up to 60s on Vercel

const SYSTEM_PROMPT = `You are the Chief of Staff for a multi-company portfolio. Answer the principal's question using ONLY the data provided in the CONTEXT below. Be specific — name people, task codes, deadlines, and companies.

STYLE:
- Direct and decision-grade. No hedging.
- British English.
- Use task codes in brackets, e.g. [DAR-007].
- If using meeting notes or minutes, name the meeting and date.
- For compliance questions, use CONTEXT.documents: name the document, its company, status (Valid/Expiring/Expired) and expiry date. Flag anything expired or expiring soon first.
- For missing-document or compliance-score questions, use CONTEXT.compliance: name the company/person, score, missing count, expired/expiring count and the missing requirement labels.
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

type PageCtx = { label?: string; taskCode?: string; companyId?: number };

async function buildContext(question: string, page?: PageCtx) {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP.has(w))
    .slice(0, 10);

  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name,person_type,active"),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  const peopleAll = (pRows ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    personType: normalizePersonType(p.person_type as string | null),
    active: (p.active as boolean | null) ?? true,
  }));
  const cMap = new Map(companies.map((c) => [c.id, c.name]));

  const matchedCompanies = companies.filter(c =>
    tokens.some(t => c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t)
  );
  // The company whose page the operator is viewing counts as matched.
  if (page?.companyId) {
    const pc = companies.find(c => c.id === page.companyId);
    if (pc && !matchedCompanies.some(c => c.id === pc.id)) matchedCompanies.push(pc);
  }
  const matchedPeople = peopleAll.filter(p =>
    tokens.some(t => p.name.toLowerCase().split(/\s+/).some(w => w === t || w.startsWith(t)))
  );

  const wantsOverdue = /overdue|late|missed|behind/.test(question.toLowerCase());
  const wantsCritical = /critical|urgent|high.priority|emergency/.test(question.toLowerCase());
  const wantsEscalated = /escalat/.test(question.toLowerCase());
  const wantsClosed = /complet|done|closed|finished/.test(question.toLowerCase());
  const wantsMeetings = /meeting|minutes|notes|decision|decided|discussion|discussed|attendee|risk|blocker|follow.up|followup/.test(question.toLowerCase());
  const wantsDocuments = /document|licen[cs]e|certificate|permit|registration|insurance|lease|visa|passport|expir|renew|complian|contract|tax|tin/.test(question.toLowerCase());
  const wantsPlanDay = /\bplan (my|the) day\b|organi[sz]e my day|what should i (do|focus|tackle|work on)( today)?|today'?s plan|\bmy day\b/.test(question.toLowerCase());

  // Personal to-dos due today (and anything overdue) — the heart of "plan my day".
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const { data: todoRows } = await sb
    .from("todos")
    .select("id,title,due_at,important, companies(name), people(name)")
    .eq("done", false)
    .not("due_at", "is", null)
    .lte("due_at", endToday.toISOString())
    .order("due_at", { ascending: true })
    .limit(40);
  const todos = (todoRows ?? []).map((r: any) => {
    const due = r.due_at ? new Date(r.due_at as string) : null;
    const company = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    const person = Array.isArray(r.people) ? r.people[0] : r.people;
    const timed = !!due && (due.getHours() !== 0 || due.getMinutes() !== 0);
    return {
      title: r.title as string,
      due: due ? due.toISOString().slice(0, 10) : null,
      time: timed && due ? `${pad2(due.getHours())}:${pad2(due.getMinutes())}` : null,
      company: company?.name ?? null,
      for: person?.name ?? null,
      important: !!r.important,
      overdue: !!due && due.getTime() < startToday.getTime(),
    };
  });

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

  // Always include the task whose page the operator is viewing.
  if (page?.taskCode) {
    const already = filtered.some(t => t.code.toLowerCase() === page.taskCode!.toLowerCase());
    if (!already) {
      const { data } = await sb.from("tasks").select(TASK_COLS).ilike("code", page.taskCode).limit(1);
      const pageTask = enrich((data ?? []) as RawTaskRow[], cMap);
      if (pageTask.length) filtered = [pageTask[0], ...filtered].slice(0, 20);
    }
  }

  // When planning the day, make sure tasks due today / overdue are in scope.
  if (wantsPlanDay) {
    const { data: dueRows } = await sb
      .from("tasks")
      .select(TASK_COLS)
      .not("deadline", "is", null)
      .lte("deadline", endToday.toISOString())
      .not("status", "in", '("Completed","Closed")')
      .order("deadline", { ascending: true })
      .limit(15);
    const dueTasks = enrich((dueRows ?? []) as RawTaskRow[], cMap);
    const have = new Set(filtered.map((t) => t.id));
    filtered = [...dueTasks.filter((t) => !have.has(t.id)), ...filtered].slice(0, 25);
  }

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

  const meetingOrFilters: string[] = [];
  if (tokens.length) {
    for (const t of tokens) {
      meetingOrFilters.push(`title.ilike.%${t}%`);
      meetingOrFilters.push(`raw_notes.ilike.%${t}%`);
      meetingOrFilters.push(`minutes.ilike.%${t}%`);
      meetingOrFilters.push(`attendees.ilike.%${t}%`);
    }
  }
  for (const c of matchedCompanies) meetingOrFilters.push(`company_id.eq.${c.id}`);

  let meetingRows: any[] = [];
  if (meetingOrFilters.length) {
    const { data } = await sb
      .from("meetings")
      .select("id,title,company_id,meeting_date,attendees,raw_notes,minutes,updated_at")
      .or(meetingOrFilters.join(","))
      .order("meeting_date", { ascending: false })
      .limit(12);
    meetingRows = data ?? [];
  }
  if (wantsMeetings && meetingRows.length < 5) {
    const { data } = await sb
      .from("meetings")
      .select("id,title,company_id,meeting_date,attendees,raw_notes,minutes,updated_at")
      .order("meeting_date", { ascending: false })
      .limit(10);
    const seenMeetings = new Set(meetingRows.map((m) => m.id));
    meetingRows = [...meetingRows, ...(data ?? []).filter((m: any) => !seenMeetings.has(m.id))];
  }
  // Today's meetings are essential when planning the day.
  if (wantsPlanDay) {
    const { data } = await sb
      .from("meetings")
      .select("id,title,company_id,meeting_date,attendees,raw_notes,minutes,updated_at")
      .gte("meeting_date", startToday.toISOString())
      .lte("meeting_date", endToday.toISOString())
      .order("meeting_date", { ascending: true })
      .limit(10);
    const seenMeetings = new Set(meetingRows.map((m) => m.id));
    meetingRows = [...meetingRows, ...(data ?? []).filter((m: any) => !seenMeetings.has(m.id))];
  }

  const meetingIds = meetingRows.map((m) => m.id as number);
  const tasksByMeeting: Record<number, string[]> = {};
  if (meetingIds.length) {
    const { data: linkRows } = await sb
      .from("meeting_tasks")
      .select("meeting_id,tasks(code)")
      .in("meeting_id", meetingIds);
    for (const row of linkRows ?? []) {
      const meetingId = row.meeting_id as number;
      const taskField = (row as { tasks?: { code?: string } | { code?: string }[] }).tasks;
      const linkedCode = Array.isArray(taskField) ? taskField[0]?.code : taskField?.code;
      if (linkedCode) (tasksByMeeting[meetingId] ||= []).push(linkedCode);
    }
  }

  // Documents: always surface anything expired/expiring (compliance is always
  // relevant); when the question is document-related, include valid ones too,
  // and match by keyword/company.
  let documentCtx: Array<{
    title: string; company: string | null; category: string | null;
    status: string; expiry: string | null; daysToExpiry: number | null;
    issuer: string | null; reference: string | null;
  }> = [];
  let complianceCtx: Array<{
    owner: string; ownerType: string; score: number; status: string;
    missing: number; expired: number; expiring: number; gaps: string[];
  }> = [];
  try {
    const allDocs = await listDocuments();
    const matchedCompanyIds = new Set(matchedCompanies.map((c) => c.id));
    const scored = allDocs.map((d) => {
      const status = deriveDocStatus(d);
      const urgent = status === "Expired" || status === "Expiring";
      const kwHit = tokens.some(
        (t) => d.title.toLowerCase().includes(t) || (d.category?.toLowerCase().includes(t) ?? false) ||
          (d.docType?.toLowerCase().includes(t) ?? false) || (d.issuer?.toLowerCase().includes(t) ?? false)
      );
      const companyHit = d.companyId != null && matchedCompanyIds.has(d.companyId);
      return { d, status, include: urgent || (wantsDocuments && (kwHit || companyHit || true)) };
    });
    documentCtx = scored
      .filter((x) => x.include)
      .sort((a, b) => (daysToExpiry(a.d) ?? Infinity) - (daysToExpiry(b.d) ?? Infinity))
      .slice(0, 20)
      .map(({ d, status }) => ({
        title: d.title,
        company: d.companyId ? cMap.get(d.companyId) ?? null : null,
        category: d.category,
        status,
        expiry: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
        daysToExpiry: daysToExpiry(d),
        issuer: d.issuer,
        reference: d.referenceNo,
      }));
    const companyScores = buildCompanyComplianceScores(companies, allDocs);
    const personScores = buildPersonComplianceScores(
      peopleAll.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, personType: p.personType })),
      allDocs
    );
    complianceCtx = worstComplianceScores([...companyScores, ...personScores], 12).map((score) => ({
      owner: score.ownerName,
      ownerType: score.ownerType,
      score: score.score,
      status: score.status,
      missing: score.missing,
      expired: score.expired,
      expiring: score.expiring,
      gaps: score.gaps.map((gap) => gap.label),
    }));
  } catch {
    /* documents are best-effort context */
  }

  return {
    today: new Date().toISOString().slice(0, 10),
    planDay: wantsPlanDay,
    todos,
    documents: documentCtx,
    compliance: complianceCtx,
    currentPage: page
      ? {
          label: page.label ?? null,
          taskCode: page.taskCode ?? null,
          company: page.companyId ? cMap.get(page.companyId) ?? null : null,
        }
      : null,
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
    meetings: meetingRows.slice(0, 12).map((m) => ({
      id: m.id as number,
      title: m.title as string,
      company: m.company_id ? cMap.get(m.company_id as number) ?? null : "Group-wide",
      date: m.meeting_date ? new Date(m.meeting_date as string).toISOString().slice(0, 10) : null,
      attendees: (m.attendees as string | null) ?? null,
      minutes: ((m.minutes as string | null) ?? "").slice(0, 1400),
      rawNotes: ((m.raw_notes as string | null) ?? "").slice(0, 900),
      linkedTaskCodes: tasksByMeeting[m.id as number] ?? [],
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = (body?.question ?? "").toString().trim();
    const history: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(body?.history) ? body.history.slice(-6) : [];
    const pageContext: PageCtx | undefined = body?.pageContext ?? undefined;
    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

    const apiKey = await getGroqKey();
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured", source: "no-key" }, { status: 503 });
    }

    // For retrieval, combine the current question with the last user message
    // so follow-ups like "open it" still hit relevant data.
    const lastUserContent = [...history].reverse().find(m => m.role === "user")?.content || "";
    const retrievalQuery = `${lastUserContent} ${question}`.trim();

    const context = await buildContext(retrievalQuery, pageContext);

    const pageNote = context.currentPage
      ? `\n\nThe principal is currently viewing: ${context.currentPage.label}${context.currentPage.taskCode ? ` (task ${context.currentPage.taskCode})` : ""}${context.currentPage.company ? ` (company ${context.currentPage.company})` : ""}. Interpret "this", "here", "this page", or "this task/company" as referring to it.`
      : "";

    const planNote = context.planDay
      ? `\n\nPLANNING MODE: Build a realistic running order for TODAY. Draw on CONTEXT.todos (respect their "time" and "important"; surface "overdue" ones first), today's meetings (CONTEXT.meetings dated today — schedule around them, don't double-book), and tasks due today/overdue. Output a compact, time-ordered list: use the given times where present, otherwise sensible morning/afternoon blocks; lead with overdue/important items; note who each to-do is "for" if set. End with a one-line focus suggestion. Under 180 words. If there's nothing due, say the day looks clear and suggest one proactive priority.`
      : "";

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nUse this CONTEXT to answer follow-up questions.${pageNote}${planNote} The conversation history is provided next.` },
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
      meetingCount: context.meetings.length,
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
