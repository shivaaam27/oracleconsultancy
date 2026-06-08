"use server";

import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { pickChannel, contactForChannel, buildTodoReminderMessage, linkFor, type Channel } from "@/lib/outbox-links";

export type Todo = {
  id: number;
  title: string;
  done: boolean;
  important: boolean;
  dueAt: string | null;
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
  id: number; title: string; done: boolean; important: boolean; due_at: string | null;
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
    id: row.id, title: row.title, done: row.done, important: row.important ?? false, dueAt: row.due_at,
    companyId: row.company_id, companyName: company?.name ?? null,
    personId: row.person_id, personName: person?.name ?? null,
    taskId: row.task_id, taskCode: task?.code ?? null,
    createdAt: row.created_at, completedAt: row.completed_at,
  };
}

const SELECT = "id,title,done,important,due_at,company_id,person_id,task_id,created_at,completed_at, companies(name), people(name), tasks(code)";

export async function listTodos(): Promise<Todo[]> {
  // Only ad-hoc personal to-dos here. Onboarding/offboarding journey steps
  // (kind != null) live in the person drawer, not the Workbook list.
  const { data, error } = await sb.from("todos").select(SELECT).is("kind", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(map);
}

export async function createTodo(input: { title: string; dueAt?: string | null; companyId?: number | null; personId?: number | null; taskId?: number | null; important?: boolean }): Promise<Todo> {
  const { data, error } = await sb.from("todos").insert({
    title: input.title.trim() || "Untitled",
    due_at: input.dueAt ?? null,
    company_id: input.companyId ?? null,
    person_id: input.personId ?? null,
    task_id: input.taskId ?? null,
    important: input.important ?? false,
    created_at: new Date().toISOString(),
    done: false,
  }).select(SELECT).single();
  if (error) throw new Error(error.message);
  revalidatePath("/workbook");
  return map(data as Row);
}

export async function updateTodo(input: { id: number; title?: string; dueAt?: string | null; companyId?: number | null; personId?: number | null; taskId?: number | null; important?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled";
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.companyId !== undefined) patch.company_id = input.companyId;
  if (input.personId !== undefined) patch.person_id = input.personId;
  if (input.taskId !== undefined) patch.task_id = input.taskId;
  if (input.important !== undefined) patch.important = input.important;
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from("todos").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/workbook");
}

export async function toggleTodo(id: number, done: boolean): Promise<void> {
  const { error } = await sb.from("todos").update({ done, completed_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/workbook");
}

export async function deleteTodo(id: number): Promise<void> {
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/workbook");
}

/**
 * Promote a to-do into a tracked task: creates a real task (company code,
 * deadline, assignee, priority from the star), links the to-do to it and marks
 * the to-do done so it leaves the open list but stays as a record.
 */
export async function promoteTodoToTask(todoId: number): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const { data: t, error } = await sb
    .from("todos")
    .select("id,title,due_at,company_id,person_id,important")
    .eq("id", todoId)
    .single();
  if (error || !t) return { ok: false, error: "To-do not found" };
  if (!t.company_id) return { ok: false, error: "Add a company to this to-do first" };

  const { data: comp } = await sb.from("companies").select("code,code_prefix").eq("id", t.company_id).maybeSingle();
  const prefix = (comp?.code_prefix as string | null) || (comp?.code as string | null) || "T";
  const now = new Date();

  let task: { id: number; code: string };
  try {
    task = await insertTaskWithUniqueCodeSb(t.company_id as number, prefix, {
      actionItem: t.title as string,
      status: "Not Started",
      priority: t.important ? "High" : "Medium",
      deadline: t.due_at ? new Date(t.due_at as string) : null,
      createdDate: now,
      lastUpdatedAt: now,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create task" };
  }

  if (t.person_id) {
    await sb.from("task_assignees").upsert({ task_id: task.id, person_id: t.person_id }, { ignoreDuplicates: true });
  }
  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: t.company_id,
    entry_type: "CREATE", field: "Task", old_value: null, new_value: t.title,
    change_reason: "Promoted from to-do", created_at: now.toISOString(), created_by: "web-ui",
  });
  await sb.from("todos").update({ task_id: task.id, done: true, completed_at: now.toISOString() }).eq("id", todoId);

  revalidatePath("/workbook");
  revalidatePath("/");
  return { ok: true, code: task.code };
}

export type TodoReminderResult =
  | { ok: true; draftId: number; channel: Channel; personName: string; subject: string; body: string; link: string | null }
  | { ok: false; error: string };

/**
 * Create a reminder draft in the Outbox for the to-do's assigned person, and
 * return a deep-link so the operator can also send it in one tap.
 */
export async function createTodoReminderDraft(todoId: number, channelOverride?: Channel): Promise<TodoReminderResult> {
  const { data: t, error } = await sb
    .from("todos")
    .select("id,title,due_at, companies(name), people(id,name,whatsapp,email,phone,preferred_channel)")
    .eq("id", todoId)
    .single();
  if (error || !t) return { ok: false, error: "To-do not found" };
  const person = Array.isArray(t.people) ? t.people[0] : t.people;
  if (!person) return { ok: false, error: "Assign someone to this to-do first" };
  const company = Array.isArray(t.companies) ? t.companies[0] : t.companies;

  const contactInfo = {
    whatsapp: (person.whatsapp as string | null) ?? null,
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
    preferredChannel: (person.preferred_channel as string | null) ?? null,
  };
  const channel = channelOverride || pickChannel(contactInfo);
  const { subject, body } = buildTodoReminderMessage(channel, {
    personName: person.name as string,
    title: t.title as string,
    dueAt: (t.due_at as string | null) ?? null,
    company: (company?.name as string | null) ?? null,
  });
  const contact = contactForChannel(contactInfo, channel);
  const now = new Date().toISOString();

  const { data: row, error: iErr } = await sb
    .from("outbox")
    .insert({
      channel, recipient_name: person.name, recipient_contact: contact,
      company: company?.name ?? null, subject: channel === "EMAIL" ? subject : null, body,
      message_type: "TODO REMINDER", status: "Draft", source: "todo",
      person_id: person.id, todo_id: t.id, created_at: now,
    })
    .select("id")
    .single();
  if (iErr) return { ok: false, error: iErr.message };

  revalidatePath("/outbox");
  return { ok: true, draftId: row.id as number, channel, personName: person.name as string, subject, body, link: linkFor(channel, contact, subject, body) };
}
