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
import { renderFactValue, type Fact, type FactEntityType, type FactValue } from "@/lib/facts-shared";

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

/** Coerce typed text into a structured value: a plain number, a comma list, or text. */
function coerceValue(field: string, raw: string): { value: FactValue; display: string } {
  const text = raw.trim();
  // A clean number (allowing thousands separators) → store as a number.
  const numeric = text.replace(/[, ]/g, "");
  if (numeric && /^-?\d+(\.\d+)?$/.test(numeric)) {
    const n = Number(numeric);
    // Let the shared renderer format money fields (TZS …) and thousands.
    return { value: n, display: renderFactValue(field, n) };
  }
  // Multi-valued fields (Directors, Shareholding) typed as "A; B; C" → a list.
  if (/directors|shareholders?|signatories/i.test(field) && /[;,]/.test(text)) {
    const list = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    return { value: list, display: list.join(", ") };
  }
  return { value: text, display: text };
}

export async function recordFactAction(
  input: RecordFactFormInput
): Promise<{ ok: boolean; error?: string }> {
  const field = (input.field ?? "").trim();
  const valueText = (input.valueText ?? "").trim();
  if (!field) return { ok: false, error: "Pick a fact to record." };
  if (!valueText) return { ok: false, error: "Enter the value." };

  const { value, display } = coerceValue(field, valueText);
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
  await setFactVerified(id, verified);
  revalidateFor(entityType, entityId);
  return { ok: true };
}

export async function deleteFactAction(
  id: number,
  entityType: FactEntityType,
  entityId: number
): Promise<{ ok: boolean }> {
  await deleteFact(id);
  revalidateFor(entityType, entityId);
  return { ok: true };
}
