"use server";

import { revalidatePath } from "next/cache";
import {
  getCompanyGovernance, type CompanyGovernance,
  addCapHolder, deleteCapHolder, addSignatory, deleteSignatory, addResolution, deleteResolution,
  addRisk, setRiskStatus, deleteRisk, addDecision, decideDecision,
} from "@/lib/governance";

/** Load one company's governance (cap table / signatories / resolutions). */
export async function loadCompanyGovernance(companyId: number): Promise<CompanyGovernance> {
  return getCompanyGovernance(companyId);
}

function revalidateGov(companyId?: number) {
  revalidatePath("/brief/board");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

// ── Per-company governance (from the company-profile GovernancePanel) ──────
export async function addCapHolderAction(companyId: number, holder: string, shares: number | null, pct: number | null, holderType: string | null) {
  if (!holder.trim()) return { ok: false, error: "Holder name required." };
  await addCapHolder(companyId, holder.trim(), shares, pct, holderType);
  revalidateGov(companyId); return { ok: true };
}
export async function deleteCapHolderAction(id: number, companyId: number) { await deleteCapHolder(id); revalidateGov(companyId); return { ok: true }; }
export async function addSignatoryAction(companyId: number, name: string, scope: string | null) {
  if (!name.trim()) return { ok: false, error: "Name required." };
  await addSignatory(companyId, name.trim(), scope?.trim() || null);
  revalidateGov(companyId); return { ok: true };
}
export async function deleteSignatoryAction(id: number, companyId: number) { await deleteSignatory(id); revalidateGov(companyId); return { ok: true }; }
export async function addResolutionAction(companyId: number, date: string | null, type: string | null, summary: string) {
  if (!summary.trim()) return { ok: false, error: "Summary required." };
  await addResolution(companyId, date || null, type?.trim() || null, summary.trim());
  revalidateGov(companyId); return { ok: true };
}
export async function deleteResolutionAction(id: number, companyId: number) { await deleteResolution(id); revalidateGov(companyId); return { ok: true }; }

// ── Portfolio risk / decisions (from the board pack editor) ────────────────
export async function addRiskAction(input: { code: string; title: string; category: string | null; likelihood: number | null; impact: number | null; owner: string | null; mitigation: string | null }) {
  if (!input.code.trim() || !input.title.trim()) return { ok: false, error: "Code and title required." };
  const res = await addRisk({ ...input, code: input.code.trim(), title: input.title.trim() });
  if (res.ok) revalidateGov();
  return res;
}
export async function setRiskStatusAction(id: number, status: string) { await setRiskStatus(id, status); revalidateGov(); return { ok: true }; }
export async function deleteRiskAction(id: number) { await deleteRisk(id); revalidateGov(); return { ok: true }; }
export async function addDecisionAction(input: { code: string; title: string; companyId: number | null; type: string | null; context: string | null; due: string | null }) {
  if (!input.code.trim() || !input.title.trim()) return { ok: false, error: "Code and title required." };
  const res = await addDecision({ ...input, code: input.code.trim(), title: input.title.trim() });
  if (res.ok) revalidateGov();
  return res;
}
export async function decideDecisionAction(id: number, decision: string) { await decideDecision(id, decision.trim() || "Decided"); revalidateGov(); return { ok: true }; }
