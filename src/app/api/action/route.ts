// /api/action — turn natural-language commands into structured mutations.
//
// Two modes:
//   POST { command: "..." }              → parses, returns intent JSON for confirmation
//   POST { command, confirm: true }      → parses AND executes

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, ilike, desc, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const maxDuration = 60;

type ParsedIntent =
  | { type: "complete"; taskCode: string; reason?: string }
  | { type: "escalate"; taskCode: string; reason?: string }
  | { type: "update";   taskCode: string; body: string; newStatus?: string }
  | { type: "create";   companyName?: string; actionItem: string; priority?: string; deadline?: string; assignee?: string }
  | { type: "set_status"; taskCode: string; status: string }
  | { type: "set_priority"; taskCode: string; priority: string }
  | { type: "navigate"; target: string; query?: string }
  | { type: "unknown"; reason: string };

const SYSTEM_PROMPT = `You are the command parser for a Chief of Staff task system. Convert the principal's natural-language command into a single JSON intent.

Possible intents (output ONLY the JSON, no prose):
- Mark a task as done: {"type":"complete","taskCode":"DAR-007"}
- Escalate a task: {"type":"escalate","taskCode":"DAR-007"}
- Add an update / progress note: {"type":"update","taskCode":"DAR-007","body":"the actual update text","newStatus":"In Progress"}
- Change status: {"type":"set_status","taskCode":"DAR-007","status":"Blocked"}
- Change priority: {"type":"set_priority","taskCode":"DAR-007","priority":"Critical"}
- Create a new task: {"type":"create","companyName":"Dar Spices","actionItem":"Send invoice","priority":"High","deadline":"2026-06-15","assignee":"Shivam"}
- Navigate / open: {"type":"navigate","target":"task","query":"DAR-007"} or {"type":"navigate","target":"company","query":"Dar Spices"} or {"type":"navigate","target":"escalations"}
- Anything else / unclear: {"type":"unknown","reason":"short reason"}

VALID STATUSES: Not Started | In Progress | Under Review | Blocked | Waiting External | Escalated | Completed | Closed
VALID PRIORITIES: Critical | High | Medium | Low

RULES:
- Task codes are like "DAR-007" or "CO01-004" — extract them exactly.
- If no task code is given but the command refers to a specific task by description, set type "unknown" with reason "Need task code (e.g. DAR-007)".
- "open it", "show me", "go to" → navigate.
- "done", "completed", "finished", "close it" → complete.
- "escalate", "raise it", "principal attention" → escalate.
- "blocked", "waiting on X", "on hold" → set_status with Blocked or Waiting External.
- For create: extract company, action, priority (urgent/critical→Critical), deadline (parse natural dates).
- Today is ${new Date().toISOString().slice(0, 10)}.
- Return ONLY JSON. No markdown, no prose, no explanations.`;

async function parseCommand(
  command: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  activeContext?: { taskCode?: string; companyName?: string },
): Promise<ParsedIntent> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { type: "unknown", reason: "AI not configured" };

  // Inject pronoun resolution context
  const contextHint = activeContext?.taskCode || activeContext?.companyName
    ? `\n\nACTIVE CONTEXT (resolve pronouns like "it", "this", "that one" using this):\n${JSON.stringify(activeContext)}`
    : "";

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT + contextHint },
    ...history.slice(-4),
    { role: "user", content: command },
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
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return { type: "unknown", reason: `groq-${res.status}` };

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content?.trim() ?? "{}";
  try {
    return JSON.parse(content) as ParsedIntent;
  } catch {
    return { type: "unknown", reason: "bad-json" };
  }
}

async function findTaskByCode(code: string) {
  // Case-insensitive exact match
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(ilike(schema.tasks.code, code))
    .limit(1);
  return rows[0] || null;
}

async function findCompanyByName(name: string) {
  const rows = await db
    .select()
    .from(schema.companies)
    .where(ilike(schema.companies.name, `%${name}%`))
    .limit(1);
  return rows[0] || null;
}

async function findPersonByName(name: string) {
  const rows = await db
    .select()
    .from(schema.people)
    .where(ilike(schema.people.name, `%${name}%`))
    .limit(1);
  return rows[0] || null;
}

async function execute(intent: ParsedIntent): Promise<{ ok: boolean; message: string; redirect?: string }> {
  const now = new Date();

  if (intent.type === "complete") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    await db.update(schema.tasks)
      .set({ status: "Completed", closedDate: now, lastUpdatedAt: now })
      .where(eq(schema.tasks.id, t.id));
    await db.insert(schema.auditLog).values({
      taskId: t.id, taskCode: t.code, companyId: t.companyId,
      entryType: "STATUS", field: "status",
      oldValue: t.status, newValue: "Completed",
      changeReason: "Marked complete via command",
      createdAt: now, createdBy: "ai-command",
    });
    revalidatePath("/registry"); revalidatePath("/"); revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `✓ Marked ${t.code} as Completed`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "escalate") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    await db.update(schema.tasks)
      .set({ escalation: "Yes", status: "Escalated", lastUpdatedAt: now })
      .where(eq(schema.tasks.id, t.id));
    await db.insert(schema.auditLog).values({
      taskId: t.id, taskCode: t.code, companyId: t.companyId,
      entryType: "ESCALATION", field: "escalation",
      oldValue: t.escalation, newValue: "Yes",
      changeReason: "Escalated via command",
      createdAt: now, createdBy: "ai-command",
    });
    revalidatePath("/escalations"); revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `🚨 Escalated ${t.code}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "update") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    if (!intent.body?.trim()) return { ok: false, message: "Update body is empty" };
    await db.insert(schema.taskUpdates).values({
      taskId: t.id, body: intent.body, createdAt: now, createdBy: "ai-command",
    });
    const patch: any = { latestUpdate: intent.body, lastUpdatedAt: now };
    if (intent.newStatus) patch.status = intent.newStatus;
    await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, t.id));
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `📝 Added update to ${t.code}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "set_status") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    const valid = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];
    if (!valid.includes(intent.status)) return { ok: false, message: `Invalid status "${intent.status}"` };
    await db.update(schema.tasks)
      .set({ status: intent.status, lastUpdatedAt: now, ...(["Completed","Closed"].includes(intent.status) ? { closedDate: now } : {}) })
      .where(eq(schema.tasks.id, t.id));
    await db.insert(schema.auditLog).values({
      taskId: t.id, taskCode: t.code, companyId: t.companyId,
      entryType: "STATUS", field: "status",
      oldValue: t.status, newValue: intent.status,
      changeReason: "Set via command",
      createdAt: now, createdBy: "ai-command",
    });
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `✓ ${t.code} → ${intent.status}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "set_priority") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    const valid = ["Critical","High","Medium","Low"];
    if (!valid.includes(intent.priority)) return { ok: false, message: `Invalid priority "${intent.priority}"` };
    await db.update(schema.tasks)
      .set({ priority: intent.priority, lastUpdatedAt: now })
      .where(eq(schema.tasks.id, t.id));
    await db.insert(schema.auditLog).values({
      taskId: t.id, taskCode: t.code, companyId: t.companyId,
      entryType: "PRIORITY", field: "priority",
      oldValue: t.priority, newValue: intent.priority,
      changeReason: "Set via command",
      createdAt: now, createdBy: "ai-command",
    });
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `⚡ ${t.code} priority → ${intent.priority}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "create") {
    let companyId: number | undefined;
    if (intent.companyName) {
      const c = await findCompanyByName(intent.companyName);
      if (c) companyId = c.id;
    }
    if (!companyId) return { ok: false, message: `Couldn't match company "${intent.companyName || ""}"` };
    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!company.length) return { ok: false, message: "Company not found" };

    // Compute next code
    const existing = await db.select({ code: schema.tasks.code }).from(schema.tasks).where(eq(schema.tasks.companyId, companyId));
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^[A-Z]+\d+-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const newCode = `${company[0].code}-${String(maxNum + 1).padStart(3, "0")}`;

    const [task] = await db.insert(schema.tasks).values({
      code: newCode,
      companyId,
      actionItem: intent.actionItem,
      status: "Not Started",
      priority: intent.priority || "Low",
      escalation: "No",
      deadline: intent.deadline ? new Date(intent.deadline) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    }).returning();

    if (intent.assignee) {
      const p = await findPersonByName(intent.assignee);
      if (p) {
        try { await db.insert(schema.taskAssignees).values({ taskId: task.id, personId: p.id }); } catch {}
      }
    }

    await db.insert(schema.auditLog).values({
      taskId: task.id, taskCode: newCode, companyId,
      entryType: "CREATE", field: "Task",
      oldValue: null, newValue: intent.actionItem,
      changeReason: "Created via command",
      createdAt: now, createdBy: "ai-command",
    });

    revalidatePath("/registry"); revalidatePath("/");
    return { ok: true, message: `✨ Created ${newCode}: ${intent.actionItem}`, redirect: `/task/${newCode}` };
  }

  return { ok: false, message: "Action could not be executed" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const command: string = (body?.command ?? "").toString().trim();
    const confirm: boolean = !!body?.confirm;
    const history = Array.isArray(body?.history) ? body.history : [];
    const activeContext = body?.activeContext || undefined;
    if (!command) return NextResponse.json({ error: "command required" }, { status: 400 });

    const intent = await parseCommand(command, history, activeContext);

    if (intent.type === "navigate") {
      // Resolve target
      let redirect = "/";
      const t = (intent.target || "").toLowerCase();
      const q = (intent.query || "").trim();
      if (t === "task" && q) {
        const task = await findTaskByCode(q);
        if (task) redirect = `/task/${task.code}`;
        else return NextResponse.json({ intent, ok: false, message: `Task "${q}" not found` });
      } else if (t === "company" && q) {
        const c = await findCompanyByName(q);
        if (c) redirect = `/companies/${c.id}`;
        else return NextResponse.json({ intent, ok: false, message: `Company "${q}" not found` });
      } else if (t === "registry") redirect = "/registry";
      else if (t === "escalations") redirect = "/escalations";
      else if (t === "digest") redirect = "/digest";
      else if (t === "meeting") redirect = "/meeting";
      else if (t === "outbox") redirect = "/outbox";
      else if (t === "audit") redirect = "/audit";
      else if (t === "people") redirect = "/people";
      else if (t === "companies") redirect = "/companies";

      return NextResponse.json({ intent, ok: true, message: `Opening…`, redirect, executed: true });
    }

    if (intent.type === "unknown") {
      return NextResponse.json({ intent, ok: false, message: intent.reason || "Couldn't understand the command" });
    }

    // For destructive/mutation intents, require explicit confirm
    if (!confirm) {
      return NextResponse.json({ intent, needsConfirm: true });
    }

    const result = await execute(intent);
    return NextResponse.json({ intent, ...result, executed: result.ok });
  } catch (e) {
    console.error("Action route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
