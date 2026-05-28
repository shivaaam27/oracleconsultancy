// /api/action — turn natural-language commands into structured mutations.
//
// Two modes:
//   POST { command: "..." }              → parses, returns intent JSON for confirmation
//   POST { command, confirm: true }      → parses AND executes

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

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

type TaskRow = {
  id: number;
  code: string;
  company_id: number;
  status: string;
  priority: string;
  escalation: string | null;
};

async function findTaskByCode(code: string): Promise<TaskRow | null> {
  const { data } = await sb
    .from("tasks")
    .select("id,code,company_id,status,priority,escalation")
    .ilike("code", code)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

async function findCompanyByName(name: string): Promise<{ id: number; code: string } | null> {
  const { data } = await sb
    .from("companies")
    .select("id,code")
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as number, code: data.code as string } : null;
}

async function findPersonByName(name: string): Promise<{ id: number; name: string } | null> {
  const { data } = await sb
    .from("people")
    .select("id,name")
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as number, name: data.name as string } : null;
}

async function audit(taskId: number, taskCode: string, companyId: number, entryType: string, field: string, oldVal: string | null, newVal: string | null, reason: string) {
  await sb.from("audit_log").insert({
    task_id: taskId, task_code: taskCode, company_id: companyId,
    entry_type: entryType, field,
    old_value: oldVal, new_value: newVal,
    change_reason: reason,
    created_at: new Date().toISOString(), created_by: "ai-command",
  });
}

async function execute(intent: ParsedIntent): Promise<{ ok: boolean; message: string; redirect?: string }> {
  const nowIso = new Date().toISOString();

  if (intent.type === "complete") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    await sb.from("tasks").update({ status: "Completed", closed_date: nowIso, last_updated_at: nowIso }).eq("id", t.id);
    await audit(t.id, t.code, t.company_id, "STATUS", "status", t.status, "Completed", "Marked complete via command");
    revalidatePath("/registry"); revalidatePath("/"); revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `✓ Marked ${t.code} as Completed`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "escalate") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    await sb.from("tasks").update({ escalation: "Yes", status: "Escalated", last_updated_at: nowIso }).eq("id", t.id);
    await audit(t.id, t.code, t.company_id, "ESCALATION", "escalation", t.escalation, "Yes", "Escalated via command");
    revalidatePath("/escalations"); revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `🚨 Escalated ${t.code}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "update") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    if (!intent.body?.trim()) return { ok: false, message: "Update body is empty" };
    await sb.from("task_updates").insert({
      task_id: t.id, body: intent.body, created_at: nowIso, created_by: "ai-command",
    });
    const patch: Record<string, unknown> = { latest_update: intent.body, last_updated_at: nowIso };
    if (intent.newStatus) patch.status = intent.newStatus;
    await sb.from("tasks").update(patch).eq("id", t.id);
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `📝 Added update to ${t.code}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "set_status") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    const valid = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];
    if (!valid.includes(intent.status)) return { ok: false, message: `Invalid status "${intent.status}"` };
    const patch: Record<string, unknown> = { status: intent.status, last_updated_at: nowIso };
    if (["Completed","Closed"].includes(intent.status)) patch.closed_date = nowIso;
    await sb.from("tasks").update(patch).eq("id", t.id);
    await audit(t.id, t.code, t.company_id, "STATUS", "status", t.status, intent.status, "Set via command");
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `✓ ${t.code} → ${intent.status}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "set_priority") {
    const t = await findTaskByCode(intent.taskCode);
    if (!t) return { ok: false, message: `Task ${intent.taskCode} not found` };
    const valid = ["Critical","High","Medium","Low"];
    if (!valid.includes(intent.priority)) return { ok: false, message: `Invalid priority "${intent.priority}"` };
    await sb.from("tasks").update({ priority: intent.priority, last_updated_at: nowIso }).eq("id", t.id);
    await audit(t.id, t.code, t.company_id, "PRIORITY", "priority", t.priority, intent.priority, "Set via command");
    revalidatePath(`/task/${t.code}`);
    return { ok: true, message: `⚡ ${t.code} priority → ${intent.priority}`, redirect: `/task/${t.code}` };
  }

  if (intent.type === "create") {
    let companyId: number | undefined;
    let companyCode: string | undefined;
    if (intent.companyName) {
      const c = await findCompanyByName(intent.companyName);
      if (c) { companyId = c.id; companyCode = c.code; }
    }
    if (!companyId || !companyCode) return { ok: false, message: `Couldn't match company "${intent.companyName || ""}"` };

    const now = new Date();
    const task = await insertTaskWithUniqueCodeSb(companyId, companyCode, {
      actionItem: intent.actionItem,
      status: "Not Started",
      priority: intent.priority || "Low",
      escalation: "No",
      deadline: intent.deadline ? new Date(intent.deadline) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });
    const newCode = task.code;

    if (intent.assignee) {
      const p = await findPersonByName(intent.assignee);
      if (p) {
        await sb
          .from("task_assignees")
          .upsert({ task_id: task.id, person_id: p.id }, { ignoreDuplicates: true });
      }
    }

    await audit(task.id, newCode, companyId, "CREATE", "Task", null, intent.actionItem, "Created via command");

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
    if (result.ok) {
      // AI command touched a task — bust the cross-request cache so the next read is fresh.
      revalidateTag("tasks", { expire: 0 });
    }
    return NextResponse.json({ intent, ...result, executed: result.ok });
  } catch (e) {
    console.error("Action route error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
