/** A subtask as the screens see it (client-safe — no database import). */
export type Subtask = { id: number; title: string; done: boolean };

/** "2 of 5" — or null when a task has no subtasks. */
export function subtaskProgress(list: Subtask[]): { done: number; total: number } | null {
  return list.length ? { done: list.filter((s) => s.done).length, total: list.length } : null;
}
