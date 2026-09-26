import "server-only";
import { sb } from "@/db/supabase";

/**
 * Who can be @-mentioned on a task: everyone assigned to it, plus the person
 * who raised it (owner, 26 Sept 2026: "make sure it works to tag people who
 * are on that specific task" — the raiser was the one missing). ONE list, used
 * both to offer names in the composer and to re-check a post on the server, so
 * the two can never disagree about who may be tagged.
 */
export async function mentionPeople(taskId: number): Promise<{ id: number; name: string }[]> {
  const [{ data: rows }, { data: task }] = await Promise.all([
    sb.from("task_assignees").select("people(id,name)").eq("task_id", taskId),
    sb.from("tasks").select("created_by_person_id").eq("id", taskId).maybeSingle(),
  ]);
  const out = new Map<number, string>();
  for (const r of rows ?? []) {
    const p = r.people as unknown as { id: number; name: string } | null;
    if (p) out.set(p.id, p.name);
  }
  const raiser = (task?.created_by_person_id as number | null) ?? null;
  if (raiser && !out.has(raiser)) {
    const { data: p } = await sb.from("people").select("id,name").eq("id", raiser).maybeSingle();
    if (p) out.set(p.id as number, p.name as string);
  }
  return [...out].map(([id, name]) => ({ id, name }));
}
