"use server";

// Server actions for the ledger (Phase 1).
//
// ⚠️ Thin wrappers, exactly like `ops/payment-actions.ts`. Every rule lives in
// `lib/ledger-*.ts` so that MCP, a cron job or a future import script gets the
// same behaviour without going through a form. Nothing here validates anything
// the engine does not already validate — a second copy of the rules is a second
// set of rules.

import { revalidatePath } from "next/cache";
import {
  createAccount, updateAccount, archiveAccount, deleteAccount, seedChartOfAccounts,
  type AccountFields,
} from "@/lib/ledger-accounts";
import {
  createJournalEntry, updateJournalEntry, deleteJournalEntry,
  postJournalEntry, reverseJournalEntry, replaceJournalLines,
  type JournalFields, type JournalLineInput,
} from "@/lib/ledger-journal";

type Result = { ok: boolean; id?: number; entryNo?: string; error?: string; errors?: string[] };

function refresh() {
  revalidatePath("/ledger");
  revalidatePath("/ledger/journals");
  revalidatePath("/ledger/entries");
}

/* ─────────────────────────────────────────────────── chart of accounts ─── */

export async function seedChartAction(companyId: number): Promise<Result & { added?: number }> {
  const res = await seedChartOfAccounts(companyId, "web-ui");
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, added: res.added };
}

export async function createAccountAction(f: AccountFields): Promise<Result> {
  const res = await createAccount({ ...f, createdBy: "web-ui" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateAccountAction(id: number, patch: Partial<AccountFields>): Promise<Result> {
  const res = await updateAccount(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveAccountAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveAccount(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function deleteAccountAction(id: number): Promise<Result> {
  const res = await deleteAccount(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────── journal entries ── */

export async function createJournalAction(f: JournalFields): Promise<Result> {
  const res = await createJournalEntry({ ...f, createdBy: "web-ui" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id, entryNo: res.entryNo };
}

export async function updateJournalAction(id: number, patch: Partial<JournalFields>): Promise<Result> {
  const res = await updateJournalEntry(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  revalidatePath(`/ledger/journals/${id}`);
  return { ok: true, id };
}

export async function saveJournalLinesAction(id: number, lines: JournalLineInput[]): Promise<Result> {
  const res = await replaceJournalLines(id, lines);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  revalidatePath(`/ledger/journals/${id}`);
  return { ok: true, id };
}

export async function deleteJournalAction(id: number): Promise<Result> {
  const res = await deleteJournalEntry(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

/** ⚠️ The one door into the books from a screen. */
export async function postJournalAction(id: number): Promise<Result> {
  const res = await postJournalEntry(id, "web-ui");
  if (!res.ok) return { ok: false, error: res.error, errors: res.errors };
  refresh();
  revalidatePath(`/ledger/journals/${id}`);
  return { ok: true, id, entryNo: res.entryNo };
}

export async function reverseJournalAction(
  id: number, opts: { date?: string | null; reason?: string | null } = {},
): Promise<Result> {
  const res = await reverseJournalEntry(id, { ...opts, by: "web-ui" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  revalidatePath(`/ledger/journals/${id}`);
  return { ok: true, id: res.id, entryNo: res.entryNo };
}
