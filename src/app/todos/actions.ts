"use server";

import { guardOwner } from "@/lib/auth/viewer";
import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";

export type Todo = {
  id: number;
  title: string;
  done: boolean;
  important: boolean;
  dueAt: string | null;
  remindAt: string | null;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  personName: string | null;
  taskId: number | null;
  taskCode: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Row = {
  id: number; title: string; done: boolean; important: boolean; due_at: string | null; remind_at: string | null;
  company_id: number | null; person_id: number | null; task_id: number | null;
  created_at: string; completed_at: string | null;
  companies?: { name: string } | { name: string }[] | null;
  people?: { name: string } | { name: string }[] | null;
  tasks?: { code: string } | { code: string }[] | null;
};

function map(row: Row): Todo {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const person = Array.isArray(row.people) ? row.people[0] : row.people;
  const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
  return {
    id: row.id, title: row.title, done: row.done, important: row.important ?? false, dueAt: row.due_at, remindAt: row.remind_at,
    companyId: row.company_id, companyName: company?.name ?? null,
    personId: row.person_id, personName: person?.name ?? null,
    taskId: row.task_id, taskCode: task?.code ?? null,
    createdAt: row.created_at, completedAt: row.completed_at,
  };
}

const SELECT = "id,title,done,important,due_at,remind_at,company_id,person_id,task_id,created_at,completed_at, companies(name), people(name), tasks(code)";

export async function listTodos(): Promise<Todo[]> {
  await guardOwner();
  // Only ad-hoc personal to-dos here. Onboarding/offboarding journey steps
  // (kind != null) live in the person drawer, not the Workbook list.
  const { data, error } = await sb.from("todos").select(SELECT).is("kind", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(map);
}

export async function createTodo(input: { title: string; dueAt?: string | null; remindAt?: string | null; companyId?: number | null; personId?: number | null; taskId?: number | null; important?: boolean; kind?: string | null }): Promise<Todo> {
  await guardOwner();
  const { data, error } = await sb.from("todos").insert({
    title: input.title.trim() || "Untitled",
    due_at: input.dueAt ?? null,
    remind_at: input.remindAt ?? null,
    company_id: input.companyId ?? null,
    person_id: input.personId ?? null,
    task_id: input.taskId ?? null,
    important: input.important ?? false,
    kind: input.kind ?? null,
    created_at: new Date().toISOString(),
    done: false,
  }).select(SELECT).single();
  if (error) throw new Error(error.message);
  revalidatePath("/");
  return map(data as Row);
}

export async function updateTodo(input: { id: number; title?: string; dueAt?: string | null; remindAt?: string | null; companyId?: number | null; personId?: number | null; taskId?: number | null; important?: boolean }): Promise<void> {
  await guardOwner();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled";
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.remindAt !== undefined) patch.remind_at = input.remindAt;
  if (input.companyId !== undefined) patch.company_id = input.companyId;
  if (input.personId !== undefined) patch.person_id = input.personId;
  if (input.taskId !== undefined) patch.task_id = input.taskId;
  if (input.important !== undefined) patch.important = input.important;
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from("todos").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function toggleTodo(id: number, done: boolean): Promise<void> {
  await guardOwner();
  const { error } = await sb.from("todos").update({ done, completed_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  // Phase 4 cascade: ticking the last onboarding step schedules the probation
  // review. Best-effort + dynamic import so it never blocks the toggle.
  if (done) {
    try {
      const { data: td } = await sb.from("todos").select("person_id,kind").eq("id", id).maybeSingle();
      if (td?.kind === "onboarding" && td.person_id) {
        const m = await import("@/lib/automation/automation-time");
        await m.cascadeOnboardingComplete(td.person_id as number);
      }
    } catch { /* cascade is best-effort */ }
  }
}

export async function deleteTodo(id: number): Promise<void> {
  await guardOwner();
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
