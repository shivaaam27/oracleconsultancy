"use server";

/**
 * Subtasks — a to-do list inside one task (owner, 25 Sept 2026: "let me create
 * subtasks for each task … editable, and can be deleted also. It will behave
 * like a to-do list within the main task"). Table `task_subtasks`, migration
 * 0170. The owner and a director (over their companies' tasks) may use them;
 * every action checks the task through `guardViewer`.
 *
 * Deleting a subtask is a real delete (it is a line on a list, not a record
 * with a history), and deleting the task deletes its list (ON DELETE CASCADE).
 */
import { sb } from "@/db/supabase";
import { guardViewer } from "@/lib/viewer";
import type { Subtask } from "@/lib/subtasks-shared";

const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);

async function taskOf(id: number): Promise<number> {
  const { data } = await sb.from("task_subtasks").select("task_id").eq("id", id).maybeSingle();
  if (!data) throw new Error("That subtask no longer exists.");
  return data.task_id as number;
}

export async function listSubtasks(taskId: number): Promise<Subtask[]> {
  await guardViewer({ taskId });
  const { data } = await sb.from("task_subtasks").select("id,title,done_at,sort_order")
    .eq("task_id", taskId).order("sort_order").order("id");
  return (data ?? []).map((r) => ({ id: r.id as number, title: r.title as string, done: !!r.done_at }));
}

export async function addSubtask(taskId: number, title: string): Promise<Subtask> {
  const v = await guardViewer({ taskId });
  const t = clean(title);
  if (!t) throw new Error("Write the subtask first.");
  const { data: last } = await sb.from("task_subtasks").select("sort_order").eq("task_id", taskId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("task_subtasks")
    .insert({ task_id: taskId, title: t, sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1, created_by: v.actor })
    .select("id,title").single();
  if (error || !data) throw new Error("Could not add the subtask.");
  return { id: data.id as number, title: data.title as string, done: false };
}

/** Several at once, in order — the new-task form hands over its list here. */
export async function addSubtasks(taskId: number, titles: string[]): Promise<void> {
  const v = await guardViewer({ taskId });
  const rows = titles.map(clean).filter(Boolean).map((title, i) => ({ task_id: taskId, title, sort_order: i + 1, created_by: v.actor }));
  if (rows.length) await sb.from("task_subtasks").insert(rows);
}

export async function renameSubtask(id: number, title: string): Promise<void> {
  await guardViewer({ taskId: await taskOf(id) });
  const t = clean(title);
  if (!t) throw new Error("A subtask needs words.");
  await sb.from("task_subtasks").update({ title: t }).eq("id", id);
}

export async function tickSubtask(id: number, done: boolean): Promise<void> {
  await guardViewer({ taskId: await taskOf(id) });
  await sb.from("task_subtasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
}

export async function deleteSubtask(id: number): Promise<void> {
  await guardViewer({ taskId: await taskOf(id) });
  await sb.from("task_subtasks").delete().eq("id", id);
}
