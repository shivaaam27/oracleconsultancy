"use server";

import { revalidatePath } from "next/cache";
import { applyAutomationSuggestion, dismissAutomationSuggestion, undoAutomationEvent } from "@/app/automations/actions";

type Res = { ok: boolean; error?: string };

// Cockpit keys are "ae:<id>" (automation event).
function parse(key: string): { engine: "ps" | "ae"; id: number } | null {
  const [engine, idStr] = key.split(":");
  const id = parseInt(idStr, 10);
  if ((engine !== "ps" && engine !== "ae") || Number.isNaN(id)) return null;
  return { engine, id };
}

/** Approve a pending item — routes to the right engine's apply. */
export async function approveCockpitItem(key: string): Promise<Res> {
  const p = parse(key);
  if (!p) return { ok: false, error: "Bad item." };
  const res = await applyAutomationSuggestion(p.id);
  revalidatePath("/approvals");
  return res;
}

export async function dismissCockpitItem(key: string): Promise<Res> {
  const p = parse(key);
  if (!p) return { ok: false, error: "Bad item." };
  const res = await dismissAutomationSuggestion(p.id);
  revalidatePath("/approvals");
  return res;
}

export async function undoCockpitItem(key: string): Promise<Res> {
  const p = parse(key);
  if (!p) return { ok: false, error: "Bad item." };
  const res = await undoAutomationEvent(p.id);
  revalidatePath("/approvals");
  return res;
}
