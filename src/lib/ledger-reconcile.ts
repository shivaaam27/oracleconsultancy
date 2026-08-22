import { sb } from "@/db/supabase";
import { listAccounts } from "@/lib/ledger-accounts";
import { listEntries } from "@/lib/ledger-post";
import { closeBlockers, recBlockers, recCheck, type BankRec, type RecCheck, type RecEntry } from "@/lib/ledger-reconcile-shared";

/* ------------------------------------------------------------------ *
 * Bank reconciliation — Stage 8, notes page 1. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ IT NEVER WRITES TO `gl_entries`, not once. Ticking an entry off writes a
 * row in `bank_rec_lines` that POINTS at it. The ledger's second rule holds —
 * a posted entry is never edited — and a reconciliation can be undone without
 * rewriting a single line of history.
 *
 * ⚠️ COMPANY-WIDE. Every one of the thirteen has a statement to tick off, so
 * this takes a `companyId` like the rest of the ledger.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** ⚠️ ONE STRING LITERAL — a split one widens to `string`. */
const REC_COLS = "id,company_id,account_id,statement_date,statement_balance,status,notes";

async function accountNames(companyId: number) {
  const all = await listAccounts(companyId, { includeArchived: true });
  return new Map(all.map((a) => [a.id, `${a.number} ${a.name}`]));
}

function toRec(r: Record<string, unknown>, names: Map<number, string>): BankRec {
  const accountId = r.account_id as number;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    accountId,
    accountName: names.get(accountId) ?? null,
    statementDate: r.statement_date as string,
    statementBalance: num(r.statement_balance),
    status: ((r.status as string) ?? "open") as BankRec["status"],
    notes: (r.notes as string | null) ?? null,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listRecs(companyId: number): Promise<BankRec[]> {
  const [{ data, error }, names] = await Promise.all([
    sb.from("bank_recs").select(REC_COLS).eq("company_id", companyId)
      .order("statement_date", { ascending: false }).order("id", { ascending: false }),
    accountNames(companyId),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[ledger] listRecs failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => toRec(r as Record<string, unknown>, names));
}

export async function getRec(id: number): Promise<BankRec | null> {
  const { data } = await sb.from("bank_recs").select(REC_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return toRec(data as Record<string, unknown>, await accountNames(data.company_id as number));
}

/**
 * Every entry on the account up to the statement date, and whether it has
 * cleared.
 *
 * ⚠️ SIGNED FROM THE BANK'S POINT OF VIEW: money IN is positive. A debit to the
 * bank account is money arriving, so `debit − credit` is the right way round —
 * and getting it backwards would make every difference look twice the size.
 *
 * ⚠️ AND IT INCLUDES REVERSALS. A posting that was taken back out still moved
 * through the account in the books, and its reversal is what cancels it; hiding
 * either one would leave the balance unexplainable.
 */
export async function recEntries(rec: BankRec): Promise<RecEntry[]> {
  const [entries, { data: cleared }] = await Promise.all([
    listEntries(rec.companyId, { accountId: rec.accountId, to: rec.statementDate, ascending: true }),
    sb.from("bank_rec_lines").select("entry_id,cleared_on"),
  ]);
  const clearedOn = new Map((cleared ?? []).map((c) => [c.entry_id as number, c.cleared_on as string]));
  return entries.map((e) => ({
    entryId: e.id,
    postingDate: (e.postingDate ?? "").slice(0, 10),
    voucherType: e.voucherType,
    voucherNo: e.voucherNo,
    party: e.party,
    remarks: e.remarks,
    amount: round2(num(e.debit) - num(e.credit)),
    clearedOn: clearedOn.get(e.id) ?? null,
  }));
}

/** What the books say the account holds on the statement date. */
export function ledgerBalance(entries: RecEntry[]): number {
  return round2(entries.reduce((t, e) => t + e.amount, 0));
}

export async function recWithCheck(id: number): Promise<{ rec: BankRec; entries: RecEntry[]; check: RecCheck } | null> {
  const rec = await getRec(id);
  if (!rec) return null;
  const entries = await recEntries(rec);
  return { rec, entries, check: recCheck(entries, ledgerBalance(entries), rec.statementBalance) };
}

/* ------------------------------- writing ------------------------------- */

export async function createRec(
  companyId: number,
  input: { accountId: number; statementDate: string; statementBalance: number; notes?: string | null },
  by = "web-ui",
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const blockers = recBlockers(input);
  if (blockers.length) return { ok: false, error: blockers[0] };
  const { data, error } = await sb.from("bank_recs").insert({
    company_id: companyId,
    account_id: input.accountId,
    statement_date: input.statementDate,
    statement_balance: num(input.statementBalance),
    notes: input.notes?.trim() || null,
    created_by: by,
    updated_at: NOW(),
  }).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as number };
}

/**
 * Tick entries off, or un-tick them.
 *
 * ⚠️ ONE ENTRY CLEARS ONCE, ANYWHERE. The unique index on `entry_id` is what
 * stops the same payment being reconciled on two statements — which would
 * balance both of them against money that only moved once.
 */
export async function setCleared(
  recId: number, entryIds: number[], cleared: boolean, clearedOn?: string,
): Promise<{ ok: boolean; error?: string }> {
  const rec = await getRec(recId);
  if (!rec) return { ok: false, error: "That reconciliation does not exist." };
  if (rec.status === "closed") {
    return { ok: false, error: "That reconciliation is closed. Reopen it before changing what has cleared." };
  }
  if (entryIds.length === 0) return { ok: true };

  if (!cleared) {
    const { error } = await sb.from("bank_rec_lines").delete().in("entry_id", entryIds).eq("rec_id", recId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await sb.from("bank_rec_lines").insert(
    entryIds.map((entryId) => ({
      company_id: rec.companyId,
      rec_id: recId,
      entry_id: entryId,
      cleared_on: clearedOn || rec.statementDate,
    })),
  );
  if (error) {
    // 23505 = it is already cleared, here or on another statement.
    return {
      ok: false,
      error: error.code === "23505"
        ? "One of those has already been reconciled — on this statement or another one. An entry can only clear once."
        : error.message,
    };
  }
  return { ok: true };
}

/**
 * ⚠️ A RECONCILIATION IS ONLY CLOSED WHEN IT AGREES. Closing one with a
 * difference still in it records that the books were checked when they were not,
 * and the next person believes it.
 */
export async function closeRec(id: number): Promise<{ ok: boolean; error?: string }> {
  const full = await recWithCheck(id);
  if (!full) return { ok: false, error: "That reconciliation does not exist." };
  const blockers = closeBlockers(full.check);
  if (blockers.length) return { ok: false, error: blockers[0] };
  const { error } = await sb.from("bank_recs").update({ status: "closed", updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function reopenRec(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("bank_recs").update({ status: "open", updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ DELETING A RECONCILIATION TAKES ITS TICKS WITH IT (the lines cascade) BUT
 * TOUCHES NO ENTRY. That is the whole point of keeping the clearance in its own
 * table: this is reversible, and the books are not involved.
 */
export async function deleteRec(id: number): Promise<{ ok: boolean; error?: string }> {
  const rec = await getRec(id);
  if (!rec) return { ok: false, error: "That reconciliation does not exist." };
  if (rec.status === "closed") {
    return { ok: false, error: "That one is closed. Reopen it first if it really has to go." };
  }
  const { error } = await sb.from("bank_recs").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The bank and cash accounts worth reconciling. */
export async function reconcilableAccounts(companyId: number) {
  const all = await listAccounts(companyId, { includeArchived: false });
  return all
    .filter((a) => !a.isGroup && (a.accountType === "Bank" || a.accountType === "Cash"))
    .map((a) => ({ id: a.id, label: `${a.number} ${a.name}`, type: a.accountType }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
