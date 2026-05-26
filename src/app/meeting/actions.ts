"use server";

import { db, schema } from "@/db";
import { extractMeetingTasks, type MeetingTask } from "@/lib/meeting-parse";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function extractWithAI(notes: string, companyMap: { id: number; name: string }[], defaultCompanyId?: number): Promise<MeetingTask[] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const [companies, people] = await Promise.all([
      db.select({ name: schema.companies.name }).from(schema.companies),
      db.select({ name: schema.people.name }).from(schema.people),
    ]);
    const cNames = companies.map(c => c.name);
    const pNames = people.map(p => p.name);

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
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const rawTasks: any[] = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

    const valid = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
    const validPriority = ["Critical", "High", "Medium", "Low"];
    const validCategory = ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];

    return rawTasks.map((t, idx): MeetingTask => {
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
  } catch (e) {
    console.error("AI meeting extract exception:", e);
    return null;
  }
}

export async function parseMeetingNotes(
  notes: string,
  defaultCompanyId?: number,
): Promise<MeetingTask[]> {
  const companies = await db
    .select({ id: schema.companies.id, name: schema.companies.name, code: schema.companies.code })
    .from(schema.companies);
  const people = await db
    .select({ id: schema.people.id, name: schema.people.name })
    .from(schema.people);

  // Try AI first; fall back to rule-based if it fails or returns empty
  const aiResult = await extractWithAI(notes, companies, defaultCompanyId);
  if (aiResult && aiResult.length > 0) return aiResult;

  return extractMeetingTasks(notes, companies, people, defaultCompanyId);
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

async function getOrCreatePerson(name: string, companyId: number): Promise<number> {
  const ex = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  if (ex.length) return ex[0].id;
  const inserted = await db
    .insert(schema.people)
    .values({ name, companyId, active: true })
    .onConflictDoNothing({ target: schema.people.name })
    .returning();
  if (inserted.length) return inserted[0].id;
  const after = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  return after[0].id;
}

async function getOrCreateDept(name: string | null): Promise<number | null> {
  if (!name) return null;
  const ex = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  if (ex.length) return ex[0].id;
  const inserted = await db
    .insert(schema.departments)
    .values({ name })
    .onConflictDoNothing({ target: schema.departments.name })
    .returning();
  if (inserted.length) return inserted[0].id;
  const after = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  return after[0].id;
}

async function insertTaskWithUniqueCode(
  companyId: number,
  codePrefix: string,
  values: Omit<typeof schema.tasks.$inferInsert, "code" | "companyId">,
): Promise<typeof schema.tasks.$inferSelect> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.select({ code: schema.tasks.code }).from(schema.tasks).where(eq(schema.tasks.companyId, companyId));
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^[A-Z]+\d+-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const newCode = `${codePrefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;
    try {
      const [row] = await db.insert(schema.tasks).values({ ...values, companyId, code: newCode }).returning();
      return row;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate key|unique/i.test(msg)) throw err;
    }
  }
  throw new Error("Could not allocate unique task code after retries");
}

export async function bulkCreateTasks(tasks: BulkTaskInput[]): Promise<{ created: number }> {
  let created = 0;
  for (const t of tasks) {
    if (!t.companyId || !t.actionItem.trim()) continue;

    const company = await db.select().from(schema.companies).where(eq(schema.companies.id, t.companyId)).limit(1);
    if (!company.length) continue;
    const code = company[0].code;
    const now = new Date();

    const task = await insertTaskWithUniqueCode(t.companyId, code, {
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

    for (const name of t.assigneeNames) {
      const pid = await getOrCreatePerson(name, t.companyId);
      try {
        await db.insert(schema.taskAssignees).values({ taskId: task.id, personId: pid });
      } catch {}
    }

    await db.insert(schema.auditLog).values({
      taskId: task.id,
      taskCode: newCode,
      companyId: t.companyId,
      entryType: "CREATE",
      field: "Task",
      oldValue: null,
      newValue: t.actionItem,
      changeReason: "Created via Meeting Mode",
      createdAt: now,
      createdBy: "meeting-mode",
    });

    created++;
  }

  revalidatePath("/registry");
  revalidatePath("/");
  return { created };
}
