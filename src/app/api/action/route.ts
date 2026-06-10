// /api/action — turn natural-language commands into structured mutations.
//
// Two modes:
//   POST { command: "..." }              → parses, returns intent JSON for confirmation
//   POST { command, confirm: true }      → parses AND executes

import { GROQ_FAST } from "@/lib/ai-models";
import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";
import { revalidatePath, revalidateTag } from "next/cache";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import type { PersonPackPurpose } from "@/lib/person-pack-shared";
import { pickChannel, contactForChannel, linkFor } from "@/lib/outbox-links";
import { getBrief, briefEmail, parseBriefPeriod } from "@/lib/director-brief";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { listLeaveRequests } from "@/lib/leave";

export const maxDuration = 60;

type ParsedIntent =
  | { type: "complete"; taskCode: string; reason?: string }
  | { type: "escalate"; taskCode: string; reason?: string }
  | { type: "update";   taskCode: string; body: string; newStatus?: string }
  | { type: "create";   companyName?: string; actionItem: string; priority?: string; deadline?: string; assignee?: string }
  | { type: "set_status"; taskCode: string; status: string }
  | { type: "set_priority"; taskCode: string; priority: string }
  | { type: "bulk"; op: "complete" | "escalate" | "set_status" | "set_priority"; status?: string; priority?: string; taskCodes?: string[] }
  | { type: "navigate"; target: string; query?: string }
  | { type: "person_pack"; personName: string; purpose: PersonPackPurpose }
  | { type: "remind"; personName: string; about?: string }
  | { type: "draft_brief"; companyName?: string; period?: string }
  | { type: "find_missing"; doc: string }
  | { type: "leave_status"; window: "today" | "week" }
  | { type: "unknown"; reason: string };

const SYSTEM_PROMPT = `You are the command parser for a Chief of Staff task system. Convert the principal's natural-language command into a single JSON intent.

Possible intents (output ONLY the JSON, no prose):
- Mark a task as done: {"type":"complete","taskCode":"DAR-007"}
- Escalate a task: {"type":"escalate","taskCode":"DAR-007"}
- Add an update / progress note: {"type":"update","taskCode":"DAR-007","body":"the actual update text","newStatus":"In Progress"}
- Change status: {"type":"set_status","taskCode":"DAR-007","status":"Blocked"}
- Change priority: {"type":"set_priority","taskCode":"DAR-007","priority":"Critical"}
- Create a new task: {"type":"create","companyName":"Dar Spices","actionItem":"Send invoice","priority":"High","deadline":"2026-06-15","assignee":"Shivam"}
- Remind a person — prepares an Outbox reminder DRAFT, never auto-sent: {"type":"remind","personName":"Shivam","about":"his work permit"}
- Draft the Director Brief — creates an email DRAFT in Outbox, never auto-sent: {"type":"draft_brief","companyName":"Dar Spices","period":"month"}. Omit companyName for the whole portfolio. period is one of month|last-month|quarter|year.
- Find who is missing a document type (read-only question): {"type":"find_missing","doc":"passport"}. Use for "who is missing a passport", "which staff don't have a work permit", "anyone without a contract".
- Who is on leave (read-only question): {"type":"leave_status","window":"today"} or {"type":"leave_status","window":"week"}. Use for "who is on leave today", "who is off this week", "anyone away".
- Apply ONE action to ALL tasks in the current view ("escalate these", "complete these", "mark these blocked", "make these high"): {"type":"bulk","op":"escalate"} | {"type":"bulk","op":"complete"} | {"type":"bulk","op":"set_status","status":"Blocked"} | {"type":"bulk","op":"set_priority","priority":"High"}. Use bulk when the command refers to the visible set ("these", "them", "all of them", "the ones shown", "the overdue ones") rather than a single task code.
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
- "remind X", "chase X", "nudge X", "follow up with X" (where X is a PERSON) → remind. But "chase/complete/escalate these/them/the ones shown" (referring to the visible list) → bulk, NOT remind.
- For create: extract company, action, priority (urgent/critical→Critical), deadline (parse natural dates).
- Today is ${new Date().toISOString().slice(0, 10)}.
- Return ONLY JSON. No markdown, no prose, no explanations.`;

const PERSON_PACK_LABELS: Record<PersonPackPurpose, string> = {
  "document-request": "Document Request",
  "expat-onboarding": "Expat Onboarding",
  "visa-permit": "Visa / Permit",
  "work-permit-renewal": "Work Permit Renewal",
  recruitment: "Recruitment File",
  "contract-signing": "Contract Signing",
  "task-reminder": "Task Reminder",
  custom: "Custom",
};

function packPurposeFromCommand(command: string): PersonPackPurpose {
  const c = command.toLowerCase();
  if (/\b(expat|onboard|onboarding|new starter)\b/.test(c)) return "expat-onboarding";
  if (/\b(work\s*permit|permit renewal|renewal|renew)\b/.test(c)) return "work-permit-renewal";
  if (/\b(visa|immigration|permit)\b/.test(c)) return "visa-permit";
  if (/\b(recruit|candidate|recruitment)\b/.test(c)) return "recruitment";
  if (/\b(contract|signing|signature)\b/.test(c)) return "contract-signing";
  if (/\b(task|reminder|chase)\b/.test(c)) return "task-reminder";
  return "document-request";
}

function parsePersonPackCommand(command: string): ParsedIntent | null {
  const c = command.trim();
  if (!/\b(pack|person pack|visa|permit|immigration|recruitment|contract)\b/i.test(c)) return null;
  if (!/\b(prepare|build|create|open|draft|make)\b/i.test(c)) return null;

  const personMatch =
    c.match(/\bfor\s+([A-Za-z][A-Za-z'.\- ]{1,80})\s*$/i) ??
    c.match(/\b(?:for|about)\s+([A-Za-z][A-Za-z'.\- ]{1,80})\b/i);
  const rawName = personMatch?.[1]?.replace(/\b(please|thanks|today|now)\b/gi, "").trim();
  if (!rawName) return { type: "unknown", reason: "Tell me who the pack is for, for example: prepare a visa pack for Shivam" };

  return { type: "person_pack", personName: rawName, purpose: packPurposeFromCommand(c) };
}

// Leading words that signal the visible task list or a non-person — when the
// "person" starts with one of these, fall through to the LLM (which produces a
// `bulk` intent, e.g. "chase these overdue ones") instead of drafting a reminder.
const VIEW_LEAD_WORDS = new Set([
  "these", "them", "those", "all", "it", "this", "that", "the", "every",
  "everyone", "everybody", "everything", "me", "us", "my", "our",
]);

/**
 * Deterministic "remind / chase / nudge / follow up with <person> [about <topic>]"
 * parser. Runs before the LLM so reminders work even with AI off and aren't
 * confused with bulk actions on the current view.
 */
function parseRemindCommand(command: string): ParsedIntent | null {
  const m = command
    .trim()
    .match(/^(?:remind|send a reminder to|chase|nudge|ping|follow[\s-]?up with|reach out to)\s+([A-Za-z][A-Za-z'.\-\s]{0,80}?)(?:\s+(?:about|on|re|regarding|to|that|for)\s+(.+))?[.!?]*$/i);
  if (!m) return null;
  const personName = (m[1] || "").trim();
  const firstWord = personName.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!personName || VIEW_LEAD_WORDS.has(firstWord)) return null;
  const about = (m[2] || "").trim().replace(/\b(please|thanks|today|now|asap)\b/gi, "").trim();
  return { type: "remind", personName, about: about || undefined };
}

/**
 * Deterministic "draft/prepare the director brief [for <company>] [for <period>]"
 * parser. Runs before the LLM so it works AI-off.
 */
function parseBriefCommand(command: string): ParsedIntent | null {
  const c = command.trim();
  if (!/\bbrief\b/i.test(c)) return null;
  if (!/\b(draft|prepare|create|generate|make|build|send)\b/i.test(c)) return null;

  let period: string | undefined;
  if (/\blast month\b/i.test(c)) period = "last-month";
  else if (/\bquarter(ly)?\b/i.test(c)) period = "quarter";
  else if (/\b(year|annual|ytd)\b/i.test(c)) period = "year";
  else if (/\b(this month|monthly)\b/i.test(c)) period = "month";

  let companyName: string | undefined;
  const m = c.match(/\bfor\s+([A-Za-z][A-Za-z'&.\- ]{1,80})/i);
  if (m) {
    const cand = m[1]
      .trim()
      .replace(/\b(this month|last month|the month|quarter|quarterly|year|annual|ytd|please|today|now)\b/gi, "")
      .trim();
    if (cand && !/^(the\s+)?(month|quarter|year)$/i.test(cand)) companyName = cand;
  }

  return { type: "draft_brief", companyName, period };
}

/**
 * Deterministic "who is missing a <doc>" read-only query parser. Runs before the
 * LLM so it works AI-off.
 */
function parseFindMissingCommand(command: string): ParsedIntent | null {
  const c = command.trim();
  const m = c.match(
    /\b(?:who(?:'s| is| are)?|which (?:people|staff|employees?)|anyone|list (?:of )?(?:people|staff|everyone))\b.*?\b(?:missing|without|needs?|doesn'?t have|don'?t have|lacks?|haven'?t (?:got|submitted)|has no|have no)\s+(?:an?\s+|the\s+)?(.+?)[?.!]*$/i,
  );
  if (!m) return null;
  let doc = (m[1] || "")
    .trim()
    .replace(/\b(on (?:file|record)|yet|documents?|docs?|uploaded|submitted)\b/gi, "")
    .trim()
    .replace(/^(an?|the)\s+/i, "")
    .trim();
  if (!doc) return null;
  return { type: "find_missing", doc };
}

/**
 * Deterministic "who is on leave [today|this week]" read-only query parser.
 * Excludes "log/book leave" (a future create) and balance questions.
 */
function parseLeaveStatusCommand(command: string): ParsedIntent | null {
  const c = command.trim();
  const mentionsLeave =
    /\b(on leave|off (?:today|this week|work)|who'?s off|away (?:today|this week))\b/i.test(c) ||
    (/\bleave\b/i.test(c) && /\b(who|anyone|anybody|list|show|today|this week|currently|right now)\b/i.test(c));
  if (!mentionsLeave) return null;
  if (/\b(log|book|request|apply|applying|how (?:much|many)|balance|entitle|remaining|left)\b/i.test(c)) return null;
  const window: "today" | "week" = /\b(this week|week)\b/i.test(c) ? "week" : "today";
  return { type: "leave_status", window };
}

async function parseCommand(
  command: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  activeContext?: { taskCode?: string; companyName?: string; viewCodes?: string[]; viewLabel?: string },
): Promise<ParsedIntent> {
  const apiKey = await getGroqKey();
  if (!apiKey) return { type: "unknown", reason: "AI not configured" };

  // Inject pronoun + current-view resolution context.
  const parts: string[] = [];
  if (activeContext?.taskCode || activeContext?.companyName) {
    parts.push(`ACTIVE CONTEXT (resolve "it", "this", "that one"):\n${JSON.stringify({ taskCode: activeContext.taskCode, companyName: activeContext.companyName })}`);
  }
  if (activeContext?.viewCodes?.length) {
    parts.push(`CURRENT VIEW (${activeContext.viewCodes.length} task(s)${activeContext.viewLabel ? `, ${activeContext.viewLabel}` : ""}). "these"/"them"/"all of them"/"the ones shown" refer to ALL of these — use a bulk intent: ${activeContext.viewCodes.join(", ")}`);
  }
  const contextHint = parts.length ? `\n\n${parts.join("\n\n")}` : "";

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
      model: GROQ_FAST,
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

type PersonContact = {
  id: number;
  name: string;
  companyName: string | null;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: string | null;
};

async function findPersonContact(name: string): Promise<PersonContact | null> {
  const { data } = await sb
    .from("people")
    .select("id,name,company_id,whatsapp,email,phone,preferred_channel")
    .ilike("name", `%${name}%`)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  let companyName: string | null = null;
  if (data.company_id) {
    const { data: company } = await sb
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    companyName = (company?.name as string | null) ?? null;
  }
  return {
    id: data.id as number,
    name: data.name as string,
    companyName,
    whatsapp: (data.whatsapp as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    preferredChannel: (data.preferred_channel as string | null) ?? null,
  };
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
    revalidatePath("/"); revalidatePath(`/task/${t.code}`);
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

  if (intent.type === "bulk") {
    const codes = (intent.taskCodes ?? []).slice(0, 50);
    if (codes.length === 0) return { ok: false, message: "No tasks in the current view to act on." };
    const done: string[] = [];
    for (const code of codes) {
      const t = await findTaskByCode(code);
      if (!t) continue;
      if (intent.op === "complete") {
        await sb.from("tasks").update({ status: "Completed", closed_date: nowIso, last_updated_at: nowIso }).eq("id", t.id);
        await audit(t.id, t.code, t.company_id, "STATUS", "status", t.status, "Completed", "Bulk complete via command");
      } else if (intent.op === "escalate") {
        await sb.from("tasks").update({ escalation: "Yes", status: "Escalated", last_updated_at: nowIso }).eq("id", t.id);
        await audit(t.id, t.code, t.company_id, "ESCALATION", "escalation", t.escalation, "Yes", "Bulk escalate via command");
      } else if (intent.op === "set_status" && intent.status) {
        const patch: Record<string, unknown> = { status: intent.status, last_updated_at: nowIso };
        if (["Completed", "Closed"].includes(intent.status)) patch.closed_date = nowIso;
        await sb.from("tasks").update(patch).eq("id", t.id);
        await audit(t.id, t.code, t.company_id, "STATUS", "status", t.status, intent.status, "Bulk status via command");
      } else if (intent.op === "set_priority" && intent.priority) {
        await sb.from("tasks").update({ priority: intent.priority, last_updated_at: nowIso }).eq("id", t.id);
        await audit(t.id, t.code, t.company_id, "PRIORITY", "priority", t.priority, intent.priority, "Bulk priority via command");
      }
      done.push(t.code);
    }
    revalidatePath("/registry"); revalidatePath("/");
    const verb = intent.op === "complete" ? "Completed" : intent.op === "escalate" ? "Escalated"
      : intent.op === "set_status" ? `Set to ${intent.status}` : `Set priority ${intent.priority}`;
    return { ok: done.length > 0, message: `${verb} ${done.length} task${done.length === 1 ? "" : "s"}: ${done.join(", ")}` };
  }

  if (intent.type === "remind") {
    const person = await findPersonContact(intent.personName);
    if (!person) return { ok: false, message: `Couldn't find an active person matching "${intent.personName}"` };

    const channel = pickChannel(person);
    const contact = contactForChannel(person, channel);
    const firstName = person.name.split(/\s+/)[0] || person.name;
    const about = intent.about?.trim();
    const subject = about ? `Reminder: ${about}` : "A quick reminder";
    const body = about
      ? `Hi ${firstName}, just a quick reminder about ${about}. Could you let me know where this stands? Thank you.`
      : `Hi ${firstName}, just a quick reminder to follow up. Could you let me know where this stands? Thank you.`;

    // De-duplicate: one reminder draft per person per day from this source.
    const source = `ai-command-remind:${person.id}`;
    const { data: existing } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", todayStartIsoRemind())
      .limit(1);
    if ((existing ?? []).length > 0) {
      return {
        ok: true,
        message: `A reminder draft for ${person.name} already exists today — open Outbox to review and send.`,
        redirect: "/outbox",
      };
    }

    const { error } = await sb.from("outbox").insert({
      channel,
      recipient_name: person.name,
      recipient_contact: contact,
      company: person.companyName,
      subject: channel === "EMAIL" ? subject : null,
      body,
      message_type: "REMINDER",
      status: "Draft",
      source,
      person_id: person.id,
      created_at: nowIso,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/outbox");

    const link = contact ? linkFor(channel, contact, subject, body) : null;
    const note = contact ? "" : " (no contact on file — add one in People before sending)";
    return {
      ok: true,
      message: `📨 Drafted a ${channel.toLowerCase()} reminder for ${person.name}${about ? ` about ${about}` : ""}${note}. Review in Outbox before sending.`,
      redirect: link ?? "/outbox",
    };
  }

  if (intent.type === "draft_brief") {
    let companyId: number | null = null;
    let companyLabel = "the portfolio";
    if (intent.companyName) {
      const c = await findCompanyByName(intent.companyName);
      if (!c) return { ok: false, message: `Couldn't match company "${intent.companyName}"` };
      companyId = c.id;
      companyLabel = intent.companyName;
    }
    // Built inline (not via the brief server action) because that action uses
    // updateTag(), which Next.js forbids inside a route handler.
    const period = parseBriefPeriod(intent.period);
    const brief = await getBrief(new Date(), period, companyId);
    const email = briefEmail(brief);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const source = `director-brief:${period}:${brief.selectedCompanyId ?? "portfolio"}`;
    const { data: existing } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", dayStart.toISOString())
      .limit(1);
    if ((existing ?? []).length > 0) {
      return {
        ok: true,
        message: `A Director Brief draft for ${companyLabel} already exists today — open Outbox to review.`,
        redirect: "/outbox",
      };
    }
    const { error } = await sb.from("outbox").insert({
      channel: "EMAIL",
      recipient_name: "Director",
      recipient_contact: null,
      company: brief.selectedCompanyName ?? "Portfolio",
      subject: email.subject,
      body: email.body,
      message_type: "DIRECTOR BRIEF",
      status: "Draft",
      source,
      created_at: nowIso,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/outbox");
    revalidatePath("/brief");
    return {
      ok: true,
      message: `📋 Drafted the Director Brief for ${companyLabel} in Outbox. Review before sending.`,
      redirect: "/outbox",
    };
  }

  return { ok: false, message: "Action could not be executed" };
}

function todayStartIsoRemind(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const command: string = (body?.command ?? "").toString().trim();
    const confirm: boolean = !!body?.confirm;
    const history = Array.isArray(body?.history) ? body.history : [];
    const activeContext = body?.activeContext || undefined;
    if (!command) return NextResponse.json({ error: "command required" }, { status: 400 });

    const intent =
      parsePersonPackCommand(command) ??
      parseRemindCommand(command) ??
      parseBriefCommand(command) ??
      parseFindMissingCommand(command) ??
      parseLeaveStatusCommand(command) ??
      await parseCommand(command, history, activeContext);

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
      else if (t === "escalations") redirect = "/";
      else if (t === "meeting") redirect = "/meeting";
      else if (t === "outbox") redirect = "/outbox";
      else if (t === "audit") redirect = "/audit";
      else if (t === "people") redirect = "/people";
      else if (t === "companies") redirect = "/companies";

      return NextResponse.json({ intent, ok: true, message: `Opening…`, redirect, executed: true });
    }

    if (intent.type === "person_pack") {
      const person = await findPersonByName(intent.personName);
      if (!person) {
        return NextResponse.json({ intent, ok: false, message: `Person "${intent.personName}" not found` });
      }
      const params = new URLSearchParams({ person: String(person.id), pack: "1", purpose: intent.purpose });
      const redirect = `/people?${params.toString()}`;
      return NextResponse.json({
        intent,
        ok: true,
        message: `Opening ${PERSON_PACK_LABELS[intent.purpose]} pack for ${person.name}. Review before drafting or sending.`,
        redirect,
        executed: true,
      });
    }

    if (intent.type === "find_missing") {
      // Read-only question — answer immediately, no mutation, no confirm.
      const scores = await buildPersonRequirementScores();
      const kw = intent.doc.toLowerCase();
      const matches = scores.filter((s) =>
        s.gaps.some(
          (g) =>
            g.label.toLowerCase().includes(kw) ||
            (g.categories ?? []).some((cat) => cat.toLowerCase().includes(kw)),
        ),
      );
      const docLabel = intent.doc.replace(/\s+/g, " ").trim();
      if (matches.length === 0) {
        return NextResponse.json({
          intent,
          ok: true,
          executed: true,
          message: `Good news — no active person has a ${docLabel} outstanding on their checklist.`,
        });
      }
      const names = matches.map((m) => m.ownerName);
      const shown = names.slice(0, 12).join(", ");
      const extra = names.length > 12 ? ` and ${names.length - 12} more` : "";
      return NextResponse.json({
        intent,
        ok: true,
        executed: true,
        message: `${names.length} ${names.length === 1 ? "person is" : "people are"} missing a ${docLabel}: ${shown}${extra}.`,
      });
    }

    if (intent.type === "leave_status") {
      const rows = await listLeaveRequests({ status: "Approved" });
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      let start = dayStart;
      let end = new Date(dayStart);
      if (intent.window === "week") {
        const dow = dayStart.getDay();
        const back = dow === 0 ? 6 : dow - 1; // week starts Monday
        start = new Date(dayStart);
        start.setDate(dayStart.getDate() - back);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
      }
      end.setHours(23, 59, 59, 999);
      const overlap = rows.filter((r) => {
        if (!r.startDate || !r.endDate) return false;
        const s = new Date(r.startDate);
        const e = new Date(r.endDate);
        return s <= end && e >= start;
      });
      const label = intent.window === "week" ? "this week" : "today";
      if (overlap.length === 0) {
        return NextResponse.json({ intent, ok: true, executed: true, message: `No one is on approved leave ${label}.` });
      }
      const list = overlap.map(
        (r) => `${r.personName ?? "Someone"} (${r.leaveTypeName ?? "leave"}, until ${new Date(r.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`,
      );
      const shown = list.slice(0, 12).join("; ");
      const extra = list.length > 12 ? ` and ${list.length - 12} more` : "";
      return NextResponse.json({
        intent,
        ok: true,
        executed: true,
        message: `${overlap.length} ${overlap.length === 1 ? "person is" : "people are"} on leave ${label}: ${shown}${extra}.`,
      });
    }

    if (intent.type === "unknown") {
      return NextResponse.json({ intent, ok: false, message: intent.reason || "Couldn't understand the command" });
    }

    // Bulk targets the current view — resolve "these" to the visible codes.
    if (intent.type === "bulk") {
      const viewCodes: string[] = Array.isArray(activeContext?.viewCodes) ? activeContext.viewCodes : [];
      if (viewCodes.length === 0) {
        return NextResponse.json({ intent: { type: "unknown", reason: "No tasks in the current view. Open a task list first." }, ok: false, message: "No tasks in the current view to act on." });
      }
      intent.taskCodes = viewCodes.slice(0, 50);
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
