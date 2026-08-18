"use server";

// Server actions for a project's reference lists (Phase 7).

import { revalidatePath } from "next/cache";
import {
  createRef, renameAndRepoint, mergeRefs, deleteRef,
  seedStarterLists, copyRefsFrom, discardProjectData,
} from "@/lib/project-refs";
import { updateProject } from "@/lib/projects";

type Result = { ok: boolean; error?: string; note?: string; name?: string };

/** Every project screen reads these lists, so all of them are refreshed. */
function refresh(projectId: number) {
  for (const tab of ["", "/budget", "/requisitions", "/cash", "/snapshot", "/site", "/setup"]) {
    revalidatePath(`/projects/${projectId}${tab}`);
  }
}

export async function createRefAction(projectId: number, kind: string, name: string): Promise<Result> {
  const res = await createRef(projectId, kind, name);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  // The stored name goes back so the dropdown can show CEMENT, not "cement".
  return { ok: true, name: res.name };
}

export async function renameRefAction(projectId: number, id: number, name: string): Promise<Result> {
  const res = await renameAndRepoint(projectId, id, name);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true };
}

export async function mergeRefsAction(projectId: number, fromId: number, intoId: number): Promise<Result> {
  const res = await mergeRefs(projectId, fromId, intoId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true };
}

export async function deleteRefAction(projectId: number, id: number): Promise<Result> {
  const res = await deleteRef(projectId, id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  // Say which happened — silently retiring something the owner asked to delete
  // would look like the button did nothing.
  return { ok: true, note: res.retired ? "It is in use, so it was retired rather than deleted." : undefined };
}

export async function seedStarterListsAction(projectId: number): Promise<Result> {
  const res = await seedStarterLists(projectId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true };
}

export async function copyRefsFromAction(intoProjectId: number, fromProjectId: number): Promise<Result> {
  const res = await copyRefsFrom(intoProjectId, fromProjectId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(intoProjectId);
  return { ok: true, note: `${res.copied} entries copied.` };
}

export async function setProjectCurrencyAction(projectId: number, currency: string): Promise<Result> {
  const res = await updateProject(projectId, { currency });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true };
}

/** ⚠️ Destructive. Guarded by a typed confirmation in the UI. */
export async function discardProjectDataAction(projectId: number): Promise<Result> {
  const res = await discardProjectData(projectId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  const total = Object.values(res.removed).reduce((s, n) => s + n, 0);
  return { ok: true, note: `${total} rows removed. The project and its lists are untouched.` };
}
