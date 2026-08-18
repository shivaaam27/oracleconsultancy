"use server";

// Server actions for the project Budget tab (Phase 2).
//
// Thin wrappers over lib/project-budget.ts. Both paths are revalidated because
// the budget total drives the PROFIT section on the project's overview — add a
// line here and the margin over there changes.

import { revalidatePath } from "next/cache";
import {
  addBudgetLine, updateBudgetLine, deleteBudgetLine,
  type BudgetLineFields,
} from "@/lib/project-budget";

type Result = { ok: boolean; id?: number; error?: string };

function refresh(projectId: number) {
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}`);   // profit + margin live here
  revalidatePath("/projects");
}

export async function addBudgetLineAction(f: BudgetLineFields): Promise<Result> {
  if (!f.itemCode?.trim()) return { ok: false, error: "Give the line an item code." };
  if (!f.category?.trim()) return { ok: false, error: "Give the line a category." };
  const res = await addBudgetLine(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(f.projectId);
  return { ok: true, id: res.id };
}

export async function updateBudgetLineAction(
  id: number, projectId: number, patch: Partial<BudgetLineFields>,
): Promise<Result> {
  const res = await updateBudgetLine(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

export async function deleteBudgetLineAction(id: number, projectId: number): Promise<Result> {
  const res = await deleteBudgetLine(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}
