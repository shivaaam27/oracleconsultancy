"use server";

// Server actions for the Site tab (Phase 6) and the payment plan (Phase 5).

import { revalidatePath } from "next/cache";
import {
  addSitePerson, setSitePersonActive, setSiteDay,
  seedDefaultStages, updatePaymentStage,
} from "@/lib/project-site";
import type { PaymentStage } from "@/lib/project-snapshot-shared";

type Result = { ok: boolean; id?: number; error?: string };

function refresh(projectId: number) {
  revalidatePath(`/projects/${projectId}/site`);
  revalidatePath(`/projects/${projectId}/snapshot`);
}

export async function addSitePersonAction(f: {
  projectId: number; name: string; designation?: string | null;
  kind?: string | null; dailyRate?: string | null; phone?: string | null;
  mealsEligible?: boolean;
}): Promise<Result> {
  const res = await addSitePerson(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(f.projectId);
  return { ok: true, id: res.id };
}

export async function setSitePersonActiveAction(id: number, projectId: number, active: boolean): Promise<Result> {
  const res = await setSitePersonActive(id, active);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

export async function setSiteDayAction(f: {
  projectId: number; personId: number; day: string;
  meal?: boolean; labourAmount?: string | null;
}): Promise<Result> {
  const res = await setSiteDay(f);
  if (!res.ok) return { ok: false, error: res.error };
  // NOTE: no revalidate here. Painting a grid fires this many times a second and
  // a refresh per square would fight the optimistic UI. The page re-reads on
  // navigation, and the grid keeps its own state meanwhile.
  return { ok: true };
}

export async function seedDefaultStagesAction(
  projectId: number,
): Promise<{ ok: boolean; error?: string; stages?: PaymentStage[] }> {
  const res = await seedDefaultStages(projectId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  revalidatePath(`/projects/${projectId}/snapshot`);
  return { ok: true, stages: res.stages };
}

export async function updatePaymentStageAction(id: number, projectId: number, patch: {
  label?: string; amount?: string | null; invoiceDate?: string | null;
  invoiceAmount?: string | null; receivedDate?: string | null; amountReceived?: string | null;
}): Promise<Result> {
  const res = await updatePaymentStage(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}
