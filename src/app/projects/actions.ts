"use server";

// Server actions for the Projects screens (Phase 1).
//
// Thin wrappers, exactly as `app/hrms/commitments/actions.ts` is: validate, call
// the library, revalidate the page, hand back a plain result the form can show.
// The arithmetic lives in lib/projects-shared.ts and the database access in
// lib/projects.ts; nothing calculated is written from here.

import { revalidatePath } from "next/cache";
import {
  createProject, updateProject, archiveProject,
  type ProjectFields,
} from "@/lib/projects";

type Result = { ok: boolean; id?: number; error?: string };

/** Both the list and the record are re-rendered — the list shows derived
 *  columns (days remaining) that a record edit changes. */
function refresh(id?: number) {
  revalidatePath("/projects");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function createProjectAction(input: ProjectFields): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Give the project a name." };
  if (!input.companyId) return { ok: false, error: "Choose which company is doing the work." };
  const res = await createProject(input);
  if (!res.ok) return { ok: false, error: "Couldn't save the project. Please try again." };
  refresh(res.id);
  return { ok: true, id: res.id };
}

export async function updateProjectAction(id: number, patch: Partial<ProjectFields>): Promise<Result> {
  if (patch.name !== undefined && !patch.name.trim()) {
    return { ok: false, error: "The project needs a name." };
  }
  const res = await updateProject(id, patch);
  if (!res.ok) return { ok: false, error: "Couldn't save your changes. Please try again." };
  refresh(id);
  return { ok: true, id };
}

/** Archive — never delete. See the note on `archiveProject`. */
export async function archiveProjectAction(id: number, archived = true): Promise<Result> {
  const res = await archiveProject(id, archived);
  if (!res.ok) return { ok: false, error: "Couldn't archive the project. Please try again." };
  refresh(id);
  return { ok: true, id };
}
