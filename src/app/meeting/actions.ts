"use server";

import { extractMeetingTasks, type MeetingTask } from "@/lib/meeting-parse";
import { revalidatePath, updateTag } from "next/cache";
import { mutate } from "@/lib/mutate";
import { setUndoCookie } from "@/lib/undo-cookie";
import { sb } from "@/db/supabase";
import { getGroqKey } from "@/lib/settings";
import { getOrCreatePersonSb, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

export type SavedMeeting = {
  id: number;
  title: string;
  companyId: number | null;
  companyName: string | null;
  meetingDate: string;
  attendees: string | null;
  rawNotes: string;
  minutes: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  tasks: {
    id: number;
    code: string;
    actionItem: string;
    status: string;
  }[];
};

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fallbackMinutes(notes: string): string {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const actionish = lines.filter((line) => /\b(to|will|needs?|follow up|send|review|prepare|confirm|schedule|update|share|resolve|check)\b/i.test(line));
  const risks = lines.filter((line) => /\b(risk|blocked|delay|issue|concern|urgent|escalat|stuck)\b/i.test(line));

  const summary = lines.slice(0, 4);
  return [
    "Summary",
    summary.length ? summary.map((line) => `- ${line}`).join("\n") : "- Meeting notes captured; no clear summary points detected.",
    "",
    "Decisions and Discussion",
    lines.length ? lines.slice(0, 8).map((line) => `- ${line}`).join("\n") : "- No detailed discussion captured yet.",
    "",
    "Risks and Blockers",
    risks.length ? risks.slice(0, 6).map((line) => `- ${line}`).join("\n") : "- No obvious risks or blockers detected.",
    "",
    "Follow-up Actions",
    actionish.length ? actionish.slice(0, 8).map((line) => `- ${line}`).join("\n") : "- No clear follow-up actions detected.",
  ].join("\n");
}

function fallbackCleanNotes(notes: string): string {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•\s]+/, "- "))
    .join("\n");
}

export async function listMeetings(): Promise<SavedMeeting[]> {
  const [{ data: meetings, error }, { data: links, error: linkErr }] = await Promise.all([
    sb
      .from("meetings")
      .select("id,title,company_id,meeting_date,attendees,raw_notes,minutes,created_at,updated_at,companies(name)")
      .order("meeting_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(30),
    sb.from("meeting_tasks").select("meeting_id,tasks(id,code,action_item,status)"),
  ]);
  if (error) throw new Error(error.message);
  if (linkErr) throw new Error(linkErr.message);

  const byMeeting = new Map<number, SavedMeeting["tasks"]>();
  for (const row of links ?? []) {
    const meetingId = row.meeting_id as number;
    const task = (row as any).tasks;
    if (!task) continue;
    const next = byMeeting.get(meetingId) ?? [];
    next.push({
      id: task.id as number,
      code: task.code as string,
      actionItem: task.action_item as string,
      status: task.status as string,
    });
    byMeeting.set(meetingId, next);
  }

  return (meetings ?? []).map((m: any) => ({
    id: m.id as number,
    title: m.title as string,
    companyId: (m.company_id as number | null) ?? null,
    companyName: (m.companies?.name as string | null) ?? null,
    meetingDate: isoDateOnly(new Date(m.meeting_date as string)),
    attendees: (m.attendees as string | null) ?? null,
    rawNotes: (m.raw_notes as string) ?? "",
    minutes: (m.minutes as string | null) ?? null,
    createdAt: m.created_at as string,
    updatedAt: m.updated_at as string,
    taskCount: byMeeting.get(m.id as number)?.length ?? 0,
    tasks: byMeeting.get(m.id as number) ?? [],
  }));
}

export async function saveMeeting(input: {
  id?: number | null;
  title: string;
  companyId?: number | null;
  meetingDate: string;
  attendees?: string | null;
  rawNotes: string;
  minutes?: string | null;
}): Promise<SavedMeeting> {
  const now = new Date().toISOString();
  const title = input.title.trim() || "Untitled meeting";
  const payload = {
    title,
    company_id: input.companyId || null,
    meeting_date: input.meetingDate ? new Date(`${input.meetingDate}T00:00:00`).toISOString() : now,
    attendees: input.attendees?.trim() || null,
    raw_notes: input.rawNotes,
    minutes: input.minutes?.trim() || null,
    updated_at: now,
  };

  if (input.id) {
    const { error } = await sb.from("meetings").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb
      .from("meetings")
      .insert({ ...payload, created_at: now, created_by: "web-ui" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    input.id = data.id as number;
  }

  revalidatePath("/meeting");
  const meetings = await listMeetings();
  const saved = meetings.find((m) => m.id === input.id);
  if (!saved) throw new Error("Meeting saved, but could not reload it.");
  return saved;
}

export async function generateMeetingMinutes(input: {
  title: string;
  companyName?: string | null;
  attendees?: string | null;
  rawNotes: string;
}): Promise<{ minutes: string; source: "ai" | "rules" | "no-key" | "error"; message?: string }> {
  const apiKey = await getGroqKey();
  if (!input.rawNotes.trim()) return { minutes: "", source: "rules", message: "Add notes before generating minutes." };
  if (!apiKey) return { minutes: fallbackMinutes(input.rawNotes), source: "no-key" };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You write concise British-English meeting minutes for a Chief of Staff command centre.

Return clean Markdown with exactly these headings:
Summary
Decisions
Risks and Blockers
Follow-up Actions

Rules:
- Keep it factual; do not invent details.
- Use short bullets.
- Preserve names, companies, dates, and amounts when present.
- Follow-up Actions should contain only action-like items.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.title,
              company: input.companyName || "Group-wide or unspecified",
              attendees: input.attendees || null,
              notes: input.rawNotes,
            }),
          },
        ],
        max_tokens: 900,
        temperature: 0.2,
      }),
    });
    if (!res.ok) return { minutes: fallbackMinutes(input.rawNotes), source: "error", message: `AI returned HTTP ${res.status}` };
    const data = await res.json();
    const minutes = String(data?.choices?.[0]?.message?.content || "").trim();
    return { minutes: minutes || fallbackMinutes(input.rawNotes), source: minutes ? "ai" : "rules" };
  } catch (err) {
    return {
      minutes: fallbackMinutes(input.rawNotes),
      source: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function improveMeetingNotes(input: {
  title: string;
  companyName?: string | null;
  rawNotes: string;
}): Promise<{ notes: string; source: "ai" | "rules" | "no-key" | "error"; message?: string }> {
  const apiKey = await getGroqKey();
  if (!input.rawNotes.trim()) return { notes: "", source: "rules", message: "Add notes before cleaning them." };
  const fallback = fallbackCleanNotes(input.rawNotes);
  if (!apiKey) return { notes: fallback, source: "no-key" };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Clean rough meeting notes in British English without changing meaning.

Rules:
- Keep all names, companies, dates, amounts, and task references.
- Do not invent or remove facts.
- Use clear short bullets grouped only when obvious.
- Preserve action-like statements because another parser will extract tasks later.
- Return only the cleaned notes.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.title,
              company: input.companyName || "Group-wide or unspecified",
              notes: input.rawNotes,
            }),
          },
        ],
        max_tokens: 1000,
        temperature: 0.15,
      }),
    });
    if (!res.ok) return { notes: fallback, source: "error", message: `AI returned HTTP ${res.status}` };
    const data = await res.json();
    const cleaned = String(data?.choices?.[0]?.message?.content || "").trim();
    return { notes: cleaned || fallback, source: cleaned ? "ai" : "rules" };
  } catch (err) {
    return {
      notes: fallback,
      source: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

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
  meetingId?: number | null;
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

          if (t.meetingId) {
            await sb
              .from("meeting_tasks")
              .upsert(
                { meeting_id: t.meetingId, task_id: task.id, created_at: now.toISOString() },
                { ignoreDuplicates: true }
              );
          }

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
  revalidatePath("/meeting");
  updateTag("tasks");

  if (!result.ok) {
    return { created: 0, failures: [{ index: -1, actionItem: "", reason: result.error }] };
  }
  if (result.undoToken) {
    await setUndoCookie(result.undoToken, `${result.result.created} task${result.result.created === 1 ? "" : "s"} created.`);
  }
  return { ...result.result, undoToken: result.undoToken };
}
