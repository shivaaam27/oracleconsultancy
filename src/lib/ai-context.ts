// Shared context loader for AI endpoints (RAG layer).
// Caches the heavy queries for a short period so we don't hammer the DB on every keystroke.

import { sb } from "@/db/supabase";

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

  const [{ data: cRows }, { data: pRows }, { data: rRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name"),
    sb.from("tasks").select("action_item").eq("archived", false).order("created_date", { ascending: false }).limit(30),
  ]);

  cache = {
    companies: (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string })),
    people: (pRows ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
    recentActionItems: (rRows ?? []).map((r) => r.action_item as string).filter((s) => s.length > 5),
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
  const { data: t } = await sb
    .from("tasks")
    .select("id,code,action_item,status,priority,deadline,category,escalation,created_date,company_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return null;

  const [{ data: companyRow }, { data: assigneeRows }, { data: updateRows }] = await Promise.all([
    t.company_id
      ? sb.from("companies").select("name").eq("id", t.company_id as number).maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from("task_assignees")
      .select("people(name)")
      .eq("task_id", taskId),
    sb
      .from("task_updates")
      .select("body,created_at")
      .eq("task_id", taskId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const companyName = companyRow ? ((companyRow.name as string | null) ?? null) : null;
  const assignees = (assigneeRows ?? [])
    .map((r) => {
      const peopleField = (r as { people?: { name?: string } | { name?: string }[] }).people;
      if (Array.isArray(peopleField)) return peopleField[0]?.name ?? null;
      return peopleField?.name ?? null;
    })
    .filter((n): n is string => !!n);

  const createdDateRaw = t.created_date as string | null;
  const daysOpen = createdDateRaw
    ? Math.floor((Date.now() - new Date(createdDateRaw).getTime()) / 86400000)
    : null;
  const deadlineRaw = t.deadline as string | null;

  return {
    id: t.id as number,
    code: t.code as string,
    actionItem: t.action_item as string,
    status: t.status as string,
    priority: t.priority as string,
    deadline: deadlineRaw
      ? new Date(deadlineRaw).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null,
    category: (t.category as string | null) ?? null,
    escalation: ((t.escalation as string | null) ?? "No"),
    companyName,
    assignees,
    recentUpdates: (updateRows ?? []).map((u) => ({
      body: u.body as string,
      createdAt: new Date(u.created_at as string).toISOString(),
    })),
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

  // PostgREST `or` filter with ilike per word.
  const orParts = words.map((w) => `action_item.ilike.%${w}%`).join(",");
  let q = sb
    .from("tasks")
    .select("id,code,action_item,status,created_date,closed_date,latest_update,company_id")
    .eq("archived", false) // never surface archived tasks as "similar" (ACTTASKS-01)
    .or(orParts)
    .limit(50);
  if (excludeId) q = q.neq("id", excludeId);

  const { data: rows } = await q;
  if (!rows || rows.length === 0) return [];

  // Hydrate company names
  const companyIds = Array.from(new Set(rows.map((r) => r.company_id as number).filter(Boolean)));
  const { data: cRows } = companyIds.length
    ? await sb.from("companies").select("id,name").in("id", companyIds)
    : { data: [] };
  const cMap = new Map((cRows ?? []).map((c) => [c.id as number, c.name as string]));

  // Rank by overlap score
  const scored = rows
    .map((r) => {
      const text = (r.action_item as string).toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { row: r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ row }) => {
    const createdDate = row.created_date as string | null;
    const closedDate = row.closed_date as string | null;
    return {
      id: row.id as number,
      code: row.code as string,
      actionItem: row.action_item as string,
      status: row.status as string,
      companyName: cMap.get(row.company_id as number) ?? null,
      resolvedInDays: closedDate && createdDate
        ? Math.floor((new Date(closedDate).getTime() - new Date(createdDate).getTime()) / 86400000)
        : null,
      latestUpdate: (row.latest_update as string | null) ?? null,
    };
  });
}

const STOP_WORDS = new Set([
  "the","and","with","from","this","that","have","will","need","needs","make","made",
  "regarding","about","follow","please","review","resolve","update","check","send",
  "your","their","ours","what","when","where","could","should","would","might","must",
  "still","just","than","then","also","into","over","more","less","only","very","much",
  "some","none","both","each","every","other","another","first","last","next","prev"
]);
