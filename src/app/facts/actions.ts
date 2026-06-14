"use server";

import { revalidatePath } from "next/cache";
import {
  listFacts,
  currentFacts,
  recordFact,
  setFactVerified,
  deleteFact,
  type EntityRef,
} from "@/lib/facts";
import { coerceFactValue, type Fact, type FactEntityType } from "@/lib/facts-shared";

function refFor(entityType: FactEntityType, entityId: number): EntityRef {
  return { type: entityType, id: entityId };
}

/** Revalidate the surfaces a fact change is visible on. */
function revalidateFor(entityType: FactEntityType, entityId: number) {
  revalidatePath("/people");
  revalidatePath("/companies");
  if (entityType === "company") revalidatePath(`/companies/${entityId}`);
}

/** Load both the current (latest-per-field) facts and the full ledger for an entity. */
export async function loadEntityFacts(
  entityType: FactEntityType,
  entityId: number
): Promise<{ current: Fact[]; all: Fact[] }> {
  const ref = refFor(entityType, entityId);
  const [current, all] = await Promise.all([currentFacts(ref), listFacts(ref)]);
  return { current, all };
}

export type RecordFactFormInput = {
  entityType: FactEntityType;
  entityId: number;
  field: string;
  /** Raw text the operator typed; coerced to number/list where it clearly is one. */
  valueText: string;
  effectiveDate?: string;
  source?: string;
  verified?: boolean;
  note?: string;
};

export async function recordFactAction(
  input: RecordFactFormInput
): Promise<{ ok: boolean; error?: string }> {
  const field = (input.field ?? "").trim();
  const valueText = (input.valueText ?? "").trim();
  if (!field) return { ok: false, error: "Pick a fact to record." };
  if (!valueText) return { ok: false, error: "Enter the value." };

  const { value, display } = coerceFactValue(field, valueText);
  const fact = await recordFact({
    entity: refFor(input.entityType, input.entityId),
    field,
    value,
    display,
    effectiveDate: input.effectiveDate || undefined,
    source: input.source?.trim() || null,
    verified: input.verified ?? false,
    note: input.note?.trim() || null,
  });
  if (!fact) return { ok: false, error: "Couldn't save that fact. Try again." };
  revalidateFor(input.entityType, input.entityId);
  return { ok: true };
}

export async function verifyFactAction(
  id: number,
  verified: boolean,
  entityType: FactEntityType,
  entityId: number
): Promise<{ ok: boolean }> {
  const ok = await setFactVerified(id, verified);
  if (ok) revalidateFor(entityType, entityId);
  return { ok };
}

export async function deleteFactAction(
  id: number,
  entityType: FactEntityType,
  entityId: number
): Promise<{ ok: boolean }> {
  const ok = await deleteFact(id);
  if (ok) revalidateFor(entityType, entityId);
  return { ok };
}
