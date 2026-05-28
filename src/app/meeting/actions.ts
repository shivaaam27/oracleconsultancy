"use server";

import { extractMeetingTasks, type MeetingTask } from "@/lib/meeting-parse";
import { revalidatePath, updateTag } from "next/cache";
import { mutate } from "@/lib/mutate";
import { setUndoCookie } from "@/lib/undo-cookie";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";
import { getOrCreatePersonSb, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

type AIExtractResult =
  | { ok: true; tasks: MeetingTask[] }
  | { ok: false; reason: "no-key" | "http-error" | "exception"; detail?: string };

async function extractWithAI(notes: string, companyMap: { id: number; name: string }[], defaultCompanyId?: number): Promise<AIExtractResult> {
  const apiKey = await getGroqKey();
  if (!apiKey) return { ok: false, reason: "no-key" };

  try {
    const [{ data: companies }, { data: people }] = await Promise.all([
      sb.from("companies").select("name"),
      sb.from("people").select("name"),
    ]);
    const cNames = (companies ?? []).map((c) => c.name as string);
    const pNames = (people ?? []).map((p) => p.name as string);

    const systemPrompt = `You are the Chief of Staff for a multi-company portfolio. Extract every action item from raw meeting notes as JSON.

KNOWN COMPANIES: ${cNames.join(", ") || "(none)"}
KNOWN PEOPLE: ${pNames.join(", ") || "(none)"}

Output exactly: { "tasks": [ { "actionItem", "companyName", "assigneeNames", "priority", "status", "deadline", "deadlineLabel", "category", "escalation" } ] }

Rules:
- actionItem: imperative verb start, 4-14 words, capitalised names.
- companyName: from KNOWN COMPANIES exactly, or null.
- assigneeNames: array of names mentioned. Empty array if none.
- priority: Critical | High | Medium | Low (Critical/High if urgent/asap/blocker).
- status: Not Started | In Progress | Under Review | Blocked | Waiting External | Escalated.
- deadline: ISO YYYY-MM-DD if inferable, else null. Today is ${new Date().toISOString().slice(0, 10)}.
- deadlineLabel: human label like "End of Week", "15 June", else null.
- category: Finance | Operations | Marketing | HR | Legal | Technology | Sales | Admin | Meetings | Strategy | Other | null.
- escalation: "Yes" if escalate/principal/urgent attention, else "No".
- Skip non-action sentences. One action = one task.
- Return ONLY JSON. No prose.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: notes },
        ],
        max_tokens: 2500,
        temperature: 0.15,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("AI meeting extract failed:", res.status);
      return { ok: false, reason: "http-error", detail: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const rawTasks: any[] = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    const valid = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
    const validPriority = ["Critical", "High", "Medium", "Low"];
    const validCategory = ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];

    const tasks = rawTasks.map((t, idx): MeetingTask => {
      const company = companyMap.find(c => c.name.toLowerCase() === (t.companyName || "").toLowerCase());
      const deadlineDate = t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? new Date(t.deadline + "T00:00:00") : null;
      return {
        lineIndex: idx,
        raw: t.actionItem || "",
        companyId: company?.id ?? defaultCompanyId ?? null,
        companyName: company?.name ?? null,
        actionItem: String(t.actionItem || "").trim(),
        priority: validPriority.includes(t.priority) ? t.priority : "Low",
        status: valid.includes(t.status) ? t.status : "Not Started",
        deadline: deadlineDate,
        deadlineLabel: t.deadlineLabel || null,
        assigneeNames: Array.isArray(t.assigneeNames) ? t.assigneeNames.map((n: any) => String(n).trim()).filter(Boolean) : [],
        category: validCategory.includes(t.category) ? t.category : null,
        escalation: t.escalation === "Yes" ? "Yes" : "No",
        risk: null,
        rawInput: t.actionItem || "",
      };
    }).filter(t => t.actionItem.length > 0);
    return { ok: true, tasks };
  } catch (e) {
    console.error("AI meeting extract exception:", e);
    return { ok: false, reason: "exception", detail: e instanceof Error ? e.message : String(e) };
  }
}

export type ParseMeetingResult = {
  tasks: MeetingTask[];
  source: "ai" | "rules" | "rules-empty-ai" | "rules-no-key" | "rules-ai-error";
  aiError?: string;
};

export async function parseMeetingNotes(
  notes: string,
  defaultCompanyId?: number,
): Promise<ParseMeetingResult> {
  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name"),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  const people = (pRows ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  const aiResult = await extractWithAI(notes, companies, defaultCompanyId);
  if (aiResult.ok && aiResult.tasks.length > 0) {
    return { tasks: aiResult.tasks, source: "ai" };
  }
  const fallback = extractMeetingTasks(notes, companies, people, defaultCompanyId);
  if (aiResult.ok) return { tasks: fallback, source: "rules-empty-ai" };
  if (aiResult.reason === "no-key") return { tasks: fallback, source: "rules-no-key" };
  return { tasks: fallback, source: "rules-ai-error", aiError: aiResult.detail };
}

export type BulkTaskInput = {
  companyId: number;
  actionItem: string;
  priority: string;
  status: string;
  deadline: string | null; // ISO date string or null
  assigneeNames: string[];
  category: string | null;
  escalation: string;
};

export type BulkFailure = { index: number; actionItem: string; reason: string };

export async function bulkCreateTasks(
  tasks: BulkTaskInput[]
): Promise<{ created: number; failures: BulkFailure[]; undoToken?: string }> {
  const result = await mutate({
    kind: "meeting.bulkCreate",
    run: async () => {
      let created = 0;
      const failures: BulkFailure[] = [];
      const createdIds: number[] = [];

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        try {
          if (!t.companyId) { failures.push({ index: i, actionItem: t.actionItem, reason: "Missing company" }); continue; }
          if (!t.actionItem.trim()) { failures.push({ index: i, actionItem: t.actionItem, reason: "Empty action item" }); continue; }

          const { data: company, error: cErr } = await sb
            .from("companies")
            .select("code")
            .eq("id", t.companyId)
            .maybeSingle();
          if (cErr) throw new Error(cErr.message);
          if (!company) { failures.push({ index: i, actionItem: t.actionItem, reason: "Company not found" }); continue; }
          const code = company.code as string;
          const now = new Date();

          const task = await insertTaskWithUniqueCodeSb(t.companyId, code, {
            actionItem: t.actionItem,
            status: t.status || "Not Started",
            priority: t.priority || "Low",
            category: t.category,
            escalation: t.escalation || "No",
            deadline: t.deadline ? new Date(t.deadline) : null,
            createdDate: now,
            lastUpdatedAt: now,
            archived: false,
          });
          const newCode = task.code;
          createdIds.push(task.id);

          for (const name of t.assigneeNames) {
            const pid = await getOrCreatePersonSb(name, t.companyId);
            await sb
              .from("task_assignees")
              .upsert({ task_id: task.id, person_id: pid }, { ignoreDuplicates: true });
          }

          await sb.from("audit_log").insert({
            task_id: task.id,
            task_code: newCode,
            company_id: t.companyId,
            entry_type: "CREATE",
            field: "Task",
            old_value: null,
            new_value: t.actionItem,
            change_reason: "Created via Meeting Mode",
            created_at: now.toISOString(),
            created_by: "meeting-mode",
          });

          created++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push({ index: i, actionItem: t.actionItem, reason: msg });
        }
      }

      return {
        result: { created, failures },
        undo: createdIds.length
          ? { kind: "meeting.bulkCreate", payload: { taskIds: createdIds } }
          : undefined,
      };
    },
  });

  revalidatePath("/registry");
  revalidatePath("/");
  updateTag("tasks");

  if (!result.ok) {
    return { created: 0, failures: [{ index: -1, actionItem: "", reason: result.error }] };
  }
  if (result.undoToken) {
    await setUndoCookie(result.undoToken, `${result.result.created} task${result.result.created === 1 ? "" : "s"} created.`);
  }
  return { ...result.result, undoToken: result.undoToken };
}
