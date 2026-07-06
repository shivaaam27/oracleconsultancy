import "server-only";
import { GROQ_FAST } from "@/lib/ai-models";
import { callGroqJson } from "@/lib/ai-json";
import { getGroqKey } from "@/lib/settings";
import { toolCatalogue, TOOL_BY_NAME } from "@/lib/ori/tools";

/**
 * ORI agent planner (Phase 0). Turns a conversation into ONE of three moves,
 * mirroring how Claude works with the owner:
 *   - "ask"     → it still needs details, so it asks a clarifying question and waits.
 *   - "confirm" → it has a concrete plan (one or more tool calls) and shows a preview
 *                 for the owner's yes before anything runs (all writes are tier ≥2).
 *   - "answer"  → nothing to do / a plain reply.
 *
 * The planner NEVER executes — it only proposes. The route runs the plan after the
 * owner confirms. This keeps "clarify → confirm → execute" honest and undoable.
 */

export type PlanStep = { tool: string; args: Record<string, unknown>; summary: string };
export type AgentTurn =
  | { mode: "ask"; reply: string }
  | { mode: "answer"; reply: string }
  | { mode: "confirm"; reply: string; plan: PlanStep[] };

export type ChatMsg = { role: "user" | "assistant"; content: string };

const OPERATING_GUIDE = `You are ORI, the chief-of-staff brain for Oracle Consultancy (a 7-company portfolio). You turn the principal's natural-language instructions into concrete actions, the way a sharp, trusted assistant would.

HOW YOU WORK (important — this is your personality):
- Think before acting. Work out exactly what the principal wants and which tools achieve it.
- CLARIFY FIRST: if a required detail is missing or ambiguous (which company? which person? what date? which director?), ASK a short, specific question and STOP — do not guess names, dates or people. One or two crisp questions at a time, never an interrogation.
- CONFIRM BEFORE ACTING: once you have everything, produce a PLAN of tool calls. You never execute here; the system shows the principal your plan and runs it only on their yes.
- Be warm, professional and concise. British English. Lead with the point. No emoji. No jargon, no JSON talk, no internal field names in your reply text.
- Never invent data. If you can't match a company/person/task, say so and ask.
- Multi-step is fine: a single instruction can become several ordered steps (e.g. create a task, then create an event).

TOOLS AVAILABLE (name (tier) — description, params; * = required):
${"${TOOLS}"}

CHAINING: when a later step in the SAME plan refers to a task you are creating in an earlier step, set its taskCode to "$new" (the system substitutes the real code). Never invent a task code.

STANDING RULES (automations): you CAN set up recurring reminders (remind_before_deadline, nudge_until_update), auto-escalation (escalate_if_no_update) and a post-deadline event (schedule_event_after_deadline). These attach to a task, so create the task first (or reference an existing task code), then add the rule(s) as further steps. For escalate_if_no_update you MUST know who to escalate to — if the principal hasn't said which director/manager, ASK. Reminders currently reach people via in-app notification + phone push; if they ask specifically for an external email/WhatsApp send, note that channel isn't wired for automatic sending yet.

OUTPUT — respond with ONLY this JSON object, nothing else:
{
  "reply": "what you say to the principal (a question if you need info, or a one-line summary of what you're about to do)",
  "need_more_info": true | false,
  "plan": [ { "tool": "create_task", "args": { "company": "Dar Spices", "title": "..." }, "summary": "Create a task for Dar Spices" } ]
}
RULES for the JSON:
- If you need more information, set need_more_info=true, put your question in "reply", and leave "plan" as [].
- If you are ready to act, set need_more_info=false, put a short confirmation summary in "reply", and fill "plan" with the ordered tool calls (use EXACT tool names + param names above). Only include args you actually know.
- If there is nothing to do, set need_more_info=false and "plan":[] and answer in "reply".
- Today's date is ${"${TODAY}"}.`;

function buildGuide(): string {
  return OPERATING_GUIDE
    .replace("${TOOLS}", toolCatalogue())
    .replace("${TODAY}", new Date().toISOString().slice(0, 10));
}

type PlannerJson = { reply?: string; need_more_info?: boolean; plan?: unknown };

export async function planTurn(messages: ChatMsg[]): Promise<AgentTurn> {
  const apiKey = await getGroqKey();
  if (!apiKey) return { mode: "answer", reply: "ORI's AI isn't switched on — add the AI key in Settings and I can start acting on your instructions." };

  const payload = [
    { role: "system", content: buildGuide() },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // The planner emits structured JSON (tool calls), which the FAST model (Gemini
  // Flash) handles well — with far more rate-limit headroom, lower latency and
  // lower cost than the "quality" model. Planning doesn't need the big model.
  const res = await callGroqJson({ messages: payload, apiKey, model: GROQ_FAST, maxTokens: 700, temperature: 0.1, source: "ori-agent" });
  if (!res.ok || !res.data) {
    const reply = res.error === "rate-limited"
      ? "ORI's AI is busy right now (rate limit) — give it a moment and try again."
      : "I couldn't work that out just now — try rephrasing, or give me a little more detail.";
    return { mode: "answer", reply };
  }

  const data = res.data as PlannerJson;
  const reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : "";
  const rawPlan = Array.isArray(data.plan) ? data.plan : [];

  // Validate the plan against the real tool registry — drop unknown tools so the
  // planner can never conjure a capability that doesn't exist.
  const plan: PlanStep[] = [];
  for (const s of rawPlan) {
    const step = s as { tool?: unknown; args?: unknown; summary?: unknown };
    const tool = typeof step.tool === "string" ? step.tool : "";
    if (!TOOL_BY_NAME.has(tool)) continue;
    plan.push({
      tool,
      args: step.args && typeof step.args === "object" ? (step.args as Record<string, unknown>) : {},
      summary: typeof step.summary === "string" ? step.summary : tool,
    });
  }

  if (plan.length > 0) return { mode: "confirm", reply: reply || "Here's what I'll do — shall I go ahead?", plan };
  if (data.need_more_info) return { mode: "ask", reply: reply || "Could you give me a little more detail?" };
  return { mode: "answer", reply: reply || "I'm not sure how to action that yet." };
}
