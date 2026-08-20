"use server";

// Server actions for tax rates (Phase 3). Thin wrappers — every rule lives in
// `lib/ledger-tax.ts`, so MCP or an import script gets the same behaviour.

import { revalidatePath } from "next/cache";
import {
  createTaxRate, updateTaxRate, archiveTaxRate, deleteTaxRate, seedTaxRates,
  type TaxRateFields,
} from "@/lib/ledger-tax";

type Result = { ok: boolean; id?: number; added?: number; error?: string };

function refresh() {
  revalidatePath("/ledger/tax");
  // The return is built from these rates, so it changes with them.
  revalidatePath("/ledger/reports/vat-return");
  revalidatePath("/ledger/reports/withholding");
}

export async function seedTaxRatesAction(companyId: number): Promise<Result> {
  const res = await seedTaxRates(companyId, "web-ui");
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, added: res.added };
}

export async function createTaxRateAction(f: TaxRateFields): Promise<Result> {
  const res = await createTaxRate({ ...f, createdBy: "web-ui" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateTaxRateAction(id: number, patch: Partial<TaxRateFields>): Promise<Result> {
  const res = await updateTaxRate(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveTaxRateAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveTaxRate(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function deleteTaxRateAction(id: number): Promise<Result> {
  const res = await deleteTaxRate(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}
