import { sb } from "@/db/supabase";

// Read + cron helpers for the merged to-do/reminder model. A "reminder" is just a
// to-do with `remind_at` set (it pings + shows in the digest). Owner to-dos have
// kind NULL; a staff member's own personal to-dos have kind 'self' (kept out of
// the admin Workbook). Journey steps use kind 'onboarding'/'offboarding'.

export type TodoCardItem = {
  id: number;
  title: string;
  done: boolean;
  important: boolean;
  remindAt: string | null;
  dueAt: string | null;
  companyName: string | null;
  personName: string | null;
};

const CARD_SELECT = "id,title,done,important,remind_at,due_at, companies(name), people(name)";

function mapCard(r: any): TodoCardItem {
  const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
  const p = Array.isArray(r.people) ? r.people[0] : r.people;
  return {
    id: r.id as number,
    title: r.title as string,
    done: !!r.done,
    important: !!r.important,
    remindAt: (r.remind_at as string | null) ?? null,
    dueAt: (r.due_at as string | null) ?? null,
    companyName: c?.name ?? null,
    personName: p?.name ?? null,
  };
}

/** Important first, then soonest time (remind or due), then it doesn't matter. */
export function sortTodoCard(a: TodoCardItem, b: TodoCardItem): number {
  if (a.important !== b.important) return a.important ? -1 : 1;
  const at = a.remindAt ?? a.dueAt;
  const bt = b.remindAt ?? b.dueAt;
  return (at ? Date.parse(at) : Infinity) - (bt ? Date.parse(bt) : Infinity);
}

/** Owner's open ad-hoc to-dos (kind NULL — journey steps excluded) for the Home card. */
export async function listOwnerTodos(): Promise<TodoCardItem[]> {
  const { data, error } = await sb.from("todos").select(CARD_SELECT).is("kind", null).eq("done", false);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(mapCard).sort(sortTodoCard);
}

/** A staff member's own personal to-dos (kind 'self') for the portal card. */
export async function listSelfTodos(personId: number): Promise<TodoCardItem[]> {
  const { data, error } = await sb.from("todos").select(CARD_SELECT).eq("kind", "self").eq("person_id", personId).eq("done", false);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(mapCard).sort(sortTodoCard);
}

export type DueReminder = { id: number; personId: number | null; kind: string | null; title: string };

/** Cron: reminder to-dos whose time has passed and still need a push. */
export async function dueTodoRemindersForPush(now = new Date()): Promise<DueReminder[]> {
  const { data, error } = await sb
    .from("todos")
    .select("id,person_id,kind,title")
    .not("remind_at", "is", null)
    .eq("done", false)
    .eq("pushed", false)
    .lte("remind_at", now.toISOString())
    .order("remind_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, personId: (r.person_id as number | null) ?? null, kind: (r.kind as string | null) ?? null, title: r.title }));
}

export async function markTodosPushed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb.from("todos").update({ pushed: true }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Owner reminder to-dos due by `end` (today), for the morning digest. */
export async function ownerReminderTodosDueBy(end: Date): Promise<Array<{ title: string; remindAt: string }>> {
  const { data, error } = await sb
    .from("todos")
    .select("title,remind_at")
    .is("kind", null)
    .eq("done", false)
    .not("remind_at", "is", null)
    .lte("remind_at", end.toISOString())
    .order("remind_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ title: r.title as string, remindAt: r.remind_at as string }));
}

/** Owner (person_id, kind) of a to-do — for portal ownership checks. */
export async function todoOwner(id: number): Promise<{ personId: number | null; kind: string | null } | undefined> {
  const { data } = await sb.from("todos").select("person_id,kind").eq("id", id).maybeSingle();
  if (!data) return undefined;
  return { personId: (data.person_id as number | null) ?? null, kind: (data.kind as string | null) ?? null };
}
