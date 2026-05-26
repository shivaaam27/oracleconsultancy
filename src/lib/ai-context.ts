// Shared context loader for AI endpoints (RAG layer).
// Caches the heavy queries for a short period so we don't hammer the DB on every keystroke.

import { db, schema } from "@/db";
import { eq, desc, and, or, ilike, isNull, ne } from "drizzle-orm";

export type AIContext = {
  companies: { id: number; name: string; code: string }[];
  people: { id: number; name: string }[];
  recentActionItems: string[];          // last 30 polished examples
  ts: number;
};

let cache: AIContext | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadContext(force = false): Promise<AIContext> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache;

  const [companies, people, recent] = await Promise.all([
    db.select({ id: schema.companies.id, name: schema.companies.name, code: schema.companies.code }).from(schema.companies),
    db.select({ id: schema.people.id, name: schema.people.name }).from(schema.people),
    db.select({ actionItem: schema.tasks.actionItem }).from(schema.tasks).orderBy(desc(schema.tasks.createdDate)).limit(30),
  ]);

  cache = {
    companies,
    people,
    recentActionItems: recent.map(r => r.actionItem).filter(s => s.length > 5),
    ts: Date.now(),
  };
  return cache;
}

export function invalidateContext() { cache = null; }

// ── Per-task context (for email drafter, ask-cos, etc.) ──────────────────────

export type TaskContext = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  category: string | null;
  escalation: string;
  companyName: string | null;
  assignees: string[];
  recentUpdates: { body: string; createdAt: string }[];
  daysOpen: number | null;
};

export async function loadTaskContext(taskId: number): Promise<TaskContext | null> {
  const rows = await db
    .select({
      id: schema.tasks.id,
      code: schema.tasks.code,
      actionItem: schema.tasks.actionItem,
      status: schema.tasks.status,
      priority: schema.tasks.priority,
      deadline: schema.tasks.deadline,
      category: schema.tasks.category,
      escalation: schema.tasks.escalation,
      createdDate: schema.tasks.createdDate,
      companyName: schema.companies.name,
    })
    .from(schema.tasks)
    .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
    .where(eq(schema.tasks.id, taskId))
    .limit(1);

  if (!rows.length) return null;
  const t = rows[0];

  const [assigneeRows, updateRows] = await Promise.all([
    db
      .select({ name: schema.people.name })
      .from(schema.taskAssignees)
      .innerJoin(schema.people, eq(schema.taskAssignees.personId, schema.people.id))
      .where(eq(schema.taskAssignees.taskId, taskId)),
    db
      .select({ body: schema.taskUpdates.body, createdAt: schema.taskUpdates.createdAt })
      .from(schema.taskUpdates)
      .where(eq(schema.taskUpdates.taskId, taskId))
      .orderBy(desc(schema.taskUpdates.createdAt))
      .limit(5),
  ]);

  const daysOpen = t.createdDate ? Math.floor((Date.now() - new Date(t.createdDate).getTime()) / 86400000) : null;

  return {
    id: t.id,
    code: t.code,
    actionItem: t.actionItem,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline ? new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null,
    category: t.category,
    escalation: t.escalation ?? "No",
    companyName: t.companyName,
    assignees: assigneeRows.map(a => a.name),
    recentUpdates: updateRows.map(u => ({ body: u.body, createdAt: new Date(u.createdAt).toISOString() })),
    daysOpen,
  };
}

// ── Find similar tasks by keyword overlap (cheap, no embeddings) ─────────────

export async function findSimilarTasks(
  query: string,
  excludeId?: number,
  limit = 5
): Promise<Array<{
  id: number; code: string; actionItem: string; status: string; companyName: string | null;
  resolvedInDays: number | null; latestUpdate: string | null;
}>> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !STOP_WORDS.has(w))
    .slice(0, 6);

  if (!words.length) return [];

  const conditions = words.map(w => ilike(schema.tasks.actionItem, `%${w}%`));
  const filter = excludeId
    ? and(or(...conditions), ne(schema.tasks.id, excludeId))
    : or(...conditions);

  const rows = await db
    .select({
      id: schema.tasks.id,
      code: schema.tasks.code,
      actionItem: schema.tasks.actionItem,
      status: schema.tasks.status,
      createdDate: schema.tasks.createdDate,
      closedDate: schema.tasks.closedDate,
      latestUpdate: schema.tasks.latestUpdate,
      companyName: schema.companies.name,
    })
    .from(schema.tasks)
    .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
    .where(filter)
    .limit(50);

  // Rank by overlap score
  const scored = rows.map(r => {
    const text = r.actionItem.toLowerCase();
    const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    return { row: r, score };
  })
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

  return scored.map(({ row }) => ({
    id: row.id,
    code: row.code,
    actionItem: row.actionItem,
    status: row.status,
    companyName: row.companyName,
    resolvedInDays: row.closedDate && row.createdDate
      ? Math.floor((new Date(row.closedDate).getTime() - new Date(row.createdDate).getTime()) / 86400000)
      : null,
    latestUpdate: row.latestUpdate,
  }));
}

const STOP_WORDS = new Set([
  "the","and","with","from","this","that","have","will","need","needs","make","made",
  "regarding","about","follow","please","review","resolve","update","check","send",
  "your","their","ours","what","when","where","could","should","would","might","must",
  "still","just","than","then","also","into","over","more","less","only","very","much",
  "some","none","both","each","every","other","another","first","last","next","prev"
]);
