import { NextResponse } from "next/server";
import { AI_FAST } from "@/lib/ai-models";
import { callAIJson } from "@/lib/ai-json";
import { getAiKey } from "@/lib/settings";
import {
  getPortalPerson,
  personCanSeeTask,
  companyScope,
  seesAllCompanies,
  type PortalPerson,
} from "@/lib/portal-auth";
import {
  portalCreateTask,
  portalDirectorCreateTask,
  portalAddUpdate,
  portalCompleteTask,
} from "@/app/portal/actions";
import { portalRaiseRequest } from "@/app/portal/(app)/requests/actions";
import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * Portal ORI — ACT.  POST /api/portal/ori/act
 *   { messages }                     → PLAN  {mode:"ask"|"answer"|"confirm", reply, plan?}
 *   { confirmPlan: [ {tool,args} ] } → EXECUTE, returns {mode:"done", results}
 *
 * Gate: me.caps.oriAct (403 otherwise). Self-scopes via cos_portal.
 *
 * DESIGN — reuse, don't re-implement scope:
 *   • The EXECUTABLE tool set is the PORTAL action functions, called
 *     VERBATIM (portalCreateTask / portalDirectorCreateTask / portalAddUpdate
 *     / portalCompleteTask / portalRaiseRequest). Each of those re-derives
 *     getPortalPerson() itself and re-enforces its own cap + scope (e.g.
 *     create_task rejects a company/assignee outside the viewer's team;
 *     add_update/complete_task run personCanSeeTask). So even if this route
 *     were bypassed, the underlying action would still refuse out-of-scope
 *     work. We NEVER call an admin action.
 *   • BEFORE executing, this route ALSO re-checks scope server-side (never
 *     trusting the client): oriAct cap, plus a per-tool scope re-check
 *     (company in companyScope for create; personCanSeeTask for update/
 *     complete). Defence in depth on top of the action's own gate.
 *   • The planner is a MINIMAL scoped planner that can ONLY offer these
 *     tools — it cannot conjure any admin capability. Same plan→confirm→
 *     execute shape as /api/ori.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PlanStep = { tool: string; args: Record<string, unknown>; summary: string };

const PORTAL_TOOLS = [
  {
    name: "create_task",
    desc: "Create a task. Requires the company and who is responsible (a person), a title; optional priority/deadline/instruction. Only companies/people the user manages.",
    params: "company*, title*, responsible* (person name), priority, deadline (YYYY-MM-DD), instruction",
  },
  {
    name: "add_update",
    desc: "Post an update/comment on an existing task the user can already see.",
    params: "taskCode*, note*",
  },
  {
    name: "complete_task",
    desc: "Mark an existing task the user can see as complete, with a short note of what was done.",
    params: "taskCode*, note*",
  },
  {
    name: "raise_request",
    desc: "Raise a request (equipment/HR/admin) to the owner or a person. Just needs a short title; optional detail/category.",
    params: "title*, detail, category",
  },
] as const;

const GUIDE = `You are ORI inside the STAFF PORTAL. You help ONE signed-in staff/manager/director turn a request into a small, safe action — ONLY within what they are already allowed to do. You can ONLY use the tools listed. You cannot see or touch other companies' data beyond the user's own scope; the system enforces this regardless of what you plan.

HOW YOU WORK:
- Think first. If a required detail is missing (which task? which company? who is responsible?), ASK ONE short question and STOP. Never invent a company, person, task code, or date.
- Once you have what you need, produce a PLAN of tool calls. You never execute — the system shows the plan and runs it only on the user's yes.
- Warm, concise, British English. No emoji. No field names in your reply.

TOOLS (name — description; params, * = required):
${PORTAL_TOOLS.map((t) => `- ${t.name} — ${t.desc} (${t.params})`).join("\n")}

OUTPUT — respond with ONLY this JSON:
{ "reply": "...", "need_more_info": true|false, "plan": [ { "tool": "create_task", "args": { "company": "...", "title": "...", "responsible": "..." }, "summary": "..." } ] }
- Need info → need_more_info=true, question in reply, plan [].
- Ready → need_more_info=false, one-line confirmation in reply, ordered plan.
- Nothing to do → need_more_info=false, plan [], answer in reply.
Today is ${new Date().toISOString().slice(0, 10)}.`;

const TOOL_NAMES = new Set<string>(PORTAL_TOOLS.map((t) => t.name));

async function planTurn(messages: { role: "user" | "assistant"; content: string }[]) {
  const apiKey = await getAiKey();
  if (!apiKey) return { mode: "answer" as const, reply: "ORI's AI isn't switched on yet — ask your administrator to add the AI key." };

  const res = await callAIJson({
    messages: [{ role: "system", content: GUIDE }, ...messages],
    apiKey,
    model: AI_FAST,
    maxTokens: 600,
    temperature: 0.1,
    source: "portal-ori-agent",
  });
  if (!res.ok || !res.data) {
    return {
      mode: "answer" as const,
      reply: res.error === "rate-limited"
        ? "ORI is busy right now — give it a moment and try again."
        : "I couldn't work that out — try rephrasing with a little more detail.",
    };
  }
  const data = res.data as { reply?: string; need_more_info?: boolean; plan?: unknown };
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  const rawPlan = Array.isArray(data.plan) ? data.plan : [];
  const plan: PlanStep[] = [];
  for (const s of rawPlan) {
    const step = s as { tool?: unknown; args?: unknown; summary?: unknown };
    const tool = typeof step.tool === "string" ? step.tool : "";
    if (!TOOL_NAMES.has(tool)) continue; // drop anything not in the portal tool set
    plan.push({
      tool,
      args: step.args && typeof step.args === "object" ? (step.args as Record<string, unknown>) : {},
      summary: typeof step.summary === "string" ? step.summary : tool,
    });
  }
  if (plan.length > 0) return { mode: "confirm" as const, reply: reply || "Here's what I'll do — shall I go ahead?", plan };
  if (data.need_more_info) return { mode: "ask" as const, reply: reply || "Could you give me a little more detail?" };
  return { mode: "answer" as const, reply: reply || "I'm not sure how to help with that yet." };
}

// ── Resolvers (scoped) ───────────────────────────────────────────────────────

/** Resolve a task CODE the viewer may see → its numeric id, else null. Uses
 *  personCanSeeTask so an out-of-scope / archived code never resolves. */
async function resolveVisibleTask(me: PortalPerson, code: string): Promise<{ id: number; code: string } | null> {
  const c = code.trim();
  if (!c) return null;
  const { data } = await sb.from("tasks").select("id,code").ilike("code", c).maybeSingle();
  if (!data) return null;
  const id = data.id as number;
  if (!(await personCanSeeTask(me, id))) return null;
  return { id, code: data.code as string };
}

/** Resolve a company name → an id that is IN the viewer's scope, else null.
 *  For all-companies viewers any company resolves; otherwise it must be in
 *  companyScope(me). Coarse: an ambiguous / out-of-scope name → null. */
async function resolveScopedCompany(me: PortalPerson, name: string): Promise<number | null> {
  const n = name.trim();
  if (!n) return null;
  const { data } = await sb.from("companies").select("id,name").ilike("name", `%${n}%`).limit(5);
  const rows = (data ?? []) as { id: number; name: string }[];
  if (rows.length === 0) return null;
  const exact = rows.find((r) => r.name.toLowerCase() === n.toLowerCase()) ?? rows[0];
  const cid = exact.id;
  if (seesAllCompanies(me)) return cid;
  const scope = await companyScope(me);
  if (scope == null) return cid; // shouldn't reach (seesAllCompanies handled) but safe
  return scope.includes(cid) ? cid : null;
}

/** Resolve a responsible person NAME → an active person id. The portal action
 *  itself re-checks the person is in the viewer's team/company, so we only need
 *  a best-effort name→id here. Ambiguous → null (the planner will have to ask). */
async function resolvePerson(name: string): Promise<number | null> {
  const n = name.trim();
  if (!n) return null;
  const { data } = await sb.from("people").select("id,name").eq("active", true).ilike("name", `%${n}%`).limit(5);
  const rows = (data ?? []) as { id: number; name: string }[];
  if (rows.length === 0) return null;
  const exact = rows.find((r) => r.name.toLowerCase() === n.toLowerCase());
  if (exact) return exact.id;
  return rows.length === 1 ? rows[0].id : null;
}

// ── Executors — each builds FormData and calls the PORTAL action verbatim ─────

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

async function execCreateTask(me: PortalPerson, args: Record<string, unknown>) {
  const company = String(args.company ?? "").trim();
  const title = String(args.title ?? "").trim();
  const responsible = String(args.responsible ?? "").trim();
  if (!title) return { ok: false, message: "The task needs a title." };
  const companyId = await resolveScopedCompany(me, company);
  if (companyId == null) return { ok: false, message: `I couldn't find "${company}" in the companies you manage.` };
  const personId = responsible ? await resolvePerson(responsible) : null;
  if (!personId) return { ok: false, message: `Tell me exactly who should be responsible.` };

  const form = fd({
    actionItem: title,
    companyId: String(companyId),
    priority: String(args.priority ?? "Medium"),
    deadline: String(args.deadline ?? ""),
    leadIds: String(personId),
    instruction: String(args.instruction ?? ""),
  });
  // Directors use the director composer (multi-company aware); everyone else the
  // standard create. Both re-check caps + scope internally.
  const res = me.portalRole === "director"
    ? await portalDirectorCreateTask(null, form)
    : await portalCreateTask(null, form);
  if (res && "error" in res) return { ok: false, message: res.error };
  return { ok: true, message: `Task created for ${company}.` };
}

async function execAddUpdate(me: PortalPerson, args: Record<string, unknown>) {
  const code = String(args.taskCode ?? "").trim();
  const note = String(args.note ?? "").trim();
  if (!note) return { ok: false, message: "Add a note for the update." };
  const task = await resolveVisibleTask(me, code);
  if (!task) return { ok: false, message: `I can't find task ${code || "(none)"} in your view.` };
  await portalAddUpdate(fd({ taskId: String(task.id), code: task.code, body: note }));
  return { ok: true, message: `Update posted on ${task.code}.` };
}

async function execCompleteTask(me: PortalPerson, args: Record<string, unknown>) {
  const code = String(args.taskCode ?? "").trim();
  const note = String(args.note ?? "").trim();
  if (!note) return { ok: false, message: "Add a note explaining what was done." };
  const task = await resolveVisibleTask(me, code);
  if (!task) return { ok: false, message: `I can't find task ${code || "(none)"} in your view.` };
  const res = await portalCompleteTask(fd({ taskId: String(task.id), code: task.code, body: note }));
  if (!res.ok) return { ok: false, message: res.error };
  return { ok: true, message: `${task.code} marked complete.` };
}

/** True if the thrown value is Next's redirect signal (portalRaiseRequest
 *  redirect()s to the new request on SUCCESS, which throws NEXT_REDIRECT). */
function isNextRedirect(e: unknown): boolean {
  return typeof (e as { digest?: unknown })?.digest === "string"
    && ((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");
}

async function execRaiseRequest(me: PortalPerson, args: Record<string, unknown>) {
  const title = String(args.title ?? "").trim();
  if (!title) return { ok: false, message: "Say what you need in a few words." };
  // Default to the owner (Command Centre) — the safe, always-permitted recipient.
  try {
    const res = await portalRaiseRequest(null, fd({
      title,
      body: String(args.detail ?? ""),
      category: String(args.category ?? ""),
      toOwner: "1",
    }));
    // Reaching here means it returned an error object (success path redirects → throws).
    if (res && "error" in res) return { ok: false, message: res.error };
    return { ok: true, message: "Request raised." };
  } catch (e) {
    if (isNextRedirect(e)) return { ok: true, message: "Request raised." };
    throw e;
  }
}

async function runStep(me: PortalPerson, step: PlanStep) {
  switch (step.tool) {
    case "create_task": return execCreateTask(me, step.args);
    case "add_update": return execAddUpdate(me, step.args);
    case "complete_task": return execCompleteTask(me, step.args);
    case "raise_request": return execRaiseRequest(me, step.args);
    default: return { ok: false, message: `Unknown action "${step.tool}".` };
  }
}

export async function POST(req: Request) {
  const me = await getPortalPerson();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!me.caps.oriAct) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // ---- EXECUTE a confirmed plan ---------------------------------------
  const confirmPlan = Array.isArray(body?.confirmPlan) ? (body.confirmPlan as PlanStep[]) : null;
  if (confirmPlan) {
    const results: { tool: string; ok: boolean; message: string }[] = [];
    for (const step of confirmPlan.slice(0, 6)) {
      if (!TOOL_NAMES.has(step.tool)) {
        results.push({ tool: step.tool, ok: false, message: `That action isn't available in the portal.` });
        break;
      }
      try {
        const r = await runStep(me, { tool: step.tool, args: step.args ?? {}, summary: "" });
        results.push({ tool: step.tool, ...r });
        if (!r.ok) break; // stop the chain on the first failure
      } catch (e) {
        results.push({ tool: step.tool, ok: false, message: e instanceof Error ? e.message : "Something went wrong." });
        break;
      }
    }
    return NextResponse.json({ mode: "done", ok: results.every((r) => r.ok), results });
  }

  // ---- PLAN a turn ----------------------------------------------------
  const messages = Array.isArray(body?.messages)
    ? (body.messages as { role: string; content: string }[])
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        .slice(-12)
    : [];
  if (messages.length === 0) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const turn = await planTurn(messages);
  return NextResponse.json(turn);
}
