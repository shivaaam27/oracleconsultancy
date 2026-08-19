// ─────────────────────────────────────────────────────────────────────────────
// THE POSTING ENGINE (SERVER-ONLY, imports `sb`) — Phase 1.
//
// **Everything that ever reaches `gl_entries` goes through `postVoucher()`.**
// That is not a style preference: it is the only reason the five rules in
// `memory/erp_gap_plan.md` can be relied upon. A second write path is a second
// set of books.
//
// ⚠️ FORWARD RULE — when Phase 5 wires the sales invoice, the purchase payment
// and the project stages into the ledger, each of them calls `postVoucher()`
// with its own `voucherType`. None of them inserts a `gl_entries` row itself,
// and none of them needs to know the five rules, because this file enforces
// them. The same rule the task module already lives by: `createTaskCore` is
// the one door, and a second insert drifts out of audit.
//
// What this file will and will not do:
//
//   ✅ Post a balanced voucher, once.
//   ✅ Un-post it, by writing a mirror set of entries.
//   ✅ Tell you what a voucher did, and whether it is still live.
//   ❌ UPDATE a `gl_entries` row. There is no code path. Anywhere.
//   ❌ DELETE a `gl_entries` row. Same.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, fetchAllRows } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";
import { listAccounts, accountsById } from "@/lib/ledger-accounts";
import {
  checkVoucher, isBaseCurrency, postingDay, round2, toBase, voucherTotals, voucherState,
  BASE_CURRENCY, TOLERANCE,
  type GlAccount, type GlEntry, type VoucherLine, type VoucherState,
} from "@/lib/ledger-shared";

export type PostResult =
  | { ok: true; entries: number; voucherType: string; voucherId: number }
  | { ok: false; error: string; errors?: string[] };

const COLS = "id,company_id,posting_date,account_id,debit,credit,currency,ex_rate,debit_fx,credit_fx,party_type,party,cost_centre,project_id,voucher_type,voucher_id,voucher_no,line_no,remarks,is_reversal,reverses_id,created_by,created_at";

function mapRow(r: Record<string, unknown>): GlEntry {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    postingDate: s("posting_date"),
    accountId: r.account_id as number,
    debit: s("debit"),
    credit: s("credit"),
    currency: s("currency"),
    exRate: s("ex_rate"),
    debitFx: s("debit_fx"),
    creditFx: s("credit_fx"),
    partyType: s("party_type"),
    party: s("party"),
    costCentre: s("cost_centre"),
    projectId: (r.project_id as number | null) ?? null,
    voucherType: (r.voucher_type as string) ?? "",
    voucherId: r.voucher_id as number,
    voucherNo: s("voucher_no"),
    lineNo: (r.line_no as number) ?? 0,
    remarks: s("remarks"),
    isReversal: Boolean(r.is_reversal),
    reversesId: (r.reverses_id as number | null) ?? null,
  };
}

/* ══════════════════════════════════════════════════════════════ reading ════ */

/** Everything one document put in the books — its postings AND its reversals. */
export async function entriesForVoucher(
  companyId: number, voucherType: string, voucherId: number,
): Promise<GlEntry[]> {
  const rows = await fetchAllRows((from, to) =>
    sb.from("gl_entries").select(COLS)
      .eq("company_id", companyId).eq("voucher_type", voucherType).eq("voucher_id", voucherId)
      .order("is_reversal").order("line_no").range(from, to));
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

/** Posted, un-posted, or never posted. */
export async function voucherStateOf(
  companyId: number, voucherType: string, voucherId: number,
): Promise<VoucherState> {
  return voucherState(await entriesForVoucher(companyId, voucherType, voucherId));
}

export type EntryFilter = {
  from?: string | null;
  to?: string | null;
  accountId?: number | null;
  party?: string | null;
  voucherType?: string | null;
  projectId?: number | null;
  /** Newest first by default — the way a person reads a ledger on screen. */
  ascending?: boolean;
  limit?: number;
};

/**
 * The entries themselves.
 *
 * ⚠️ `fetchAllRows`. A ledger passes a thousand rows within weeks, and
 * PostgREST truncates silently — a general ledger showing the newest 1,000
 * postings and calling it the year is precisely the fault that hid a year of
 * enquiries in Aug 2026.
 */
export async function listEntries(companyId: number, f: EntryFilter = {}): Promise<GlEntry[]> {
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("gl_entries").select(COLS).eq("company_id", companyId);
    if (f.from) q = q.gte("posting_date", f.from);
    if (f.to) q = q.lte("posting_date", `${f.to}T23:59:59.999Z`);
    if (f.accountId != null) q = q.eq("account_id", f.accountId);
    if (f.party) q = q.eq("party", f.party);
    if (f.voucherType) q = q.eq("voucher_type", f.voucherType);
    if (f.projectId != null) q = q.eq("project_id", f.projectId);
    const asc = f.ascending ?? false;
    return q.order("posting_date", { ascending: asc })
      .order("id", { ascending: asc })
      .range(from, to);
  });
  const all = rows.map((r) => mapRow(r as Record<string, unknown>));
  return f.limit ? all.slice(0, f.limit) : all;
}

/** Entries across several companies — what the consolidated reports read. */
export async function listEntriesForCompanies(
  companyIds: number[], f: Omit<EntryFilter, "limit"> = {},
): Promise<GlEntry[]> {
  if (companyIds.length === 0) return [];
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("gl_entries").select(COLS).in("company_id", companyIds);
    if (f.from) q = q.gte("posting_date", f.from);
    if (f.to) q = q.lte("posting_date", `${f.to}T23:59:59.999Z`);
    if (f.accountId != null) q = q.eq("account_id", f.accountId);
    return q.order("posting_date", { ascending: f.ascending ?? false }).order("id").range(from, to);
  });
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

/* ══════════════════════════════════════════════════════════════ posting ════ */

export type PostVoucherInput = {
  companyId: number;
  /** "Journal Entry", "Sales Invoice", "Payment" — what sort of document. */
  voucherType: string;
  /** The row id in that document's own table. */
  voucherId: number;
  /** What a person calls it: "JV-0007", an invoice number. */
  voucherNo?: string | null;
  postingDate: string | Date;
  /** ⚠️ Amounts are in `currency`, NOT in shillings. Converted here, once. */
  lines: VoucherLine[];
  currency?: string | null;
  exRate?: number | null;
  remarks?: string | null;
  createdBy?: string;
  /** Pre-loaded accounts, when the caller already has them. Saves a round trip. */
  accounts?: GlAccount[];
};

/**
 * **Put a document in the books.**
 *
 * The order of business, and none of it is optional:
 *
 *  1. **Rule 1 — it balances.** `checkVoucher()` runs against the real accounts,
 *     so a group account, an archived account or another company's account is
 *     caught here and not by a foreign key three layers down.
 *  2. **Rule 4 — the rate is frozen.** Every line is converted to shillings
 *     ONCE, at the rate on the voucher, and both the shillings and the original
 *     are written down. A foreign voucher with no rate is refused, not guessed.
 *  3. **It still balances in shillings.** Converting 2dp amounts by a rate
 *     leaves rounding crumbs; a drift of a few cents is absorbed on the largest
 *     line and SAID SO in its remarks. Anything bigger is a refusal.
 *  4. **Rule 5 — posted once, explicitly.** An already-posted voucher is
 *     refused. Two clicks on Post cannot double the books; and if the check
 *     ever raced, the unique index `gl_entries_voucher_line_unique` refuses the
 *     second write at the database.
 *  5. **One INSERT.** Every line goes in a single statement, so the books can
 *     never hold half a voucher. ⚠️ Do not "improve" this into a loop —
 *     PostgREST gives us no transaction, and the single statement IS the
 *     atomicity.
 */
export async function postVoucher(input: PostVoucherInput): Promise<PostResult> {
  const {
    companyId, voucherType, voucherId, voucherNo = null,
    lines, currency = null, exRate = null, remarks = null, createdBy = "web-ui",
  } = input;

  const date = postingDay(input.postingDate);
  if (!date) return { ok: false, error: "A posting needs a date." };
  if (!voucherType.trim()) return { ok: false, error: "A posting needs to say what document it came from." };

  /* 1 — rule 1, against the real chart. */
  const accounts = input.accounts ?? await listAccounts(companyId, { includeArchived: true });
  const byId = accountsById(accounts);
  const check = checkVoucher(lines, byId, { companyId });
  if (!check.ok) {
    return { ok: false, error: check.errors[0], errors: check.errors };
  }

  /* 2 — rule 4, the frozen rate. */
  const base = isBaseCurrency(currency);
  if (!base && (exRate === null || !Number.isFinite(exRate) || exRate <= 0)) {
    return {
      ok: false,
      error: `This voucher is in ${currency} and has no exchange rate. Recording foreign money as shillings would make the books fiction.`,
    };
  }

  type Converted = VoucherLine & { debitBase: number; creditBase: number };
  const converted: Converted[] = [];
  for (const l of lines) {
    const d = toBase(l.debit, currency, exRate);
    const c = toBase(l.credit, currency, exRate);
    if (d === null || c === null) {
      return { ok: false, error: `A line could not be converted to ${BASE_CURRENCY}. Check the exchange rate.` };
    }
    converted.push({ ...l, debitBase: d, creditBase: c });
  }

  /* 3 — it must still balance after conversion. */
  const baseTotals = voucherTotals(converted.map((l) => ({ ...l, debit: l.debitBase, credit: l.creditBase })));
  if (!baseTotals.balanced) {
    const drift = baseTotals.difference;
    // Per-line rounding cannot exceed half a cent, so n lines cannot drift by
    // more than 0.005n. Anything past that is a real fault, not a crumb.
    const allowance = round2(0.01 * converted.length + TOLERANCE);
    if (Math.abs(drift) > allowance) {
      return {
        ok: false,
        error: `Converted to ${BASE_CURRENCY} the voucher is out by ${drift.toFixed(2)}, which is too much to be rounding. Check the exchange rate.`,
      };
    }
    // Absorb the crumb on the biggest line — and write it down, so nobody ever
    // wonders where a stray cent came from.
    const biggest = converted.reduce((a, b) =>
      Math.max(b.debitBase, b.creditBase) > Math.max(a.debitBase, a.creditBase) ? b : a);
    if (biggest.debitBase > 0) biggest.debitBase = round2(biggest.debitBase - drift);
    else biggest.creditBase = round2(biggest.creditBase + drift);
    biggest.remarks = [biggest.remarks, `Rounding on conversion: ${(-drift).toFixed(2)}`]
      .filter(Boolean).join(" · ");
  }

  /* 4 — rule 5, posted once. */
  const already = await entriesForVoucher(companyId, voucherType, voucherId);
  const state = voucherState(already);
  if (state === "posted") {
    return { ok: false, error: `${voucherNo ?? voucherType} is already in the books.` };
  }
  if (state === "reversed") {
    return {
      ok: false,
      error: `${voucherNo ?? voucherType} was posted and then reversed. Both sets of entries stay on the record — raise a new document rather than re-posting this one.`,
    };
  }

  /* 5 — one statement. */
  const payload = converted.map((l, i) => ({
    company_id: companyId,
    posting_date: date,
    account_id: l.accountId,
    debit: l.debitBase.toFixed(2),
    credit: l.creditBase.toFixed(2),
    currency: base ? null : currency,
    ex_rate: base ? null : String(exRate),
    debit_fx: base ? null : round2(l.debit).toFixed(2),
    credit_fx: base ? null : round2(l.credit).toFixed(2),
    party_type: l.partyType ?? null,
    party: l.party ?? null,
    cost_centre: l.costCentre ?? null,
    project_id: l.projectId ?? null,
    voucher_type: voucherType,
    voucher_id: voucherId,
    voucher_no: voucherNo,
    line_no: i,
    remarks: l.remarks ?? remarks,
    is_reversal: false,
    created_by: createdBy,
  }));

  const { error } = await sb.from("gl_entries").insert(payload);
  if (error) {
    if (error.message.includes("gl_entries_voucher_line_unique")) {
      return { ok: false, error: `${voucherNo ?? voucherType} is already in the books.` };
    }
    return { ok: false, error: error.message };
  }

  await recordEvent("ledger.posted", "ok", {
    companyId, voucherType, voucherId, voucherNo,
    lines: payload.length, debit: baseTotals.debit, by: createdBy,
  });

  return { ok: true, entries: payload.length, voucherType, voucherId };
}

/* ═════════════════════════════════════════════════════════════ reversing ═══ */

export type UnpostInput = {
  companyId: number;
  voucherType: string;
  voucherId: number;
  /**
   * When the reversal lands.
   *
   * ⚠️ Defaults to the ORIGINAL posting date, so the month the mistake was made
   * in nets back to nothing and last month's figures stay true. Pass a later
   * date only when that period is closed and must not move — which is a
   * decision for whoever signs the accounts, not for the code.
   */
  reversalDate?: string | Date | null;
  reason?: string | null;
  createdBy?: string;
};

/**
 * **Take a document back out of the books — by writing, never by erasing.**
 *
 * Rule 2 in one function. For every entry the voucher made, a mirror entry goes
 * in with the sides swapped and `reverses_id` pointing at the original. Both
 * stay visible in the general ledger for ever, and their net effect is nil.
 *
 * This is what "un-post" means everywhere in COS from now on. There is no
 * delete, and adding one would break the audit trail the whole system is built
 * on.
 */
export async function unpostVoucher(input: UnpostInput): Promise<PostResult> {
  const { companyId, voucherType, voucherId, reason = null, createdBy = "web-ui" } = input;

  const existing = await entriesForVoucher(companyId, voucherType, voucherId);
  const state = voucherState(existing);
  if (state === "unposted") return { ok: false, error: "That document is not in the books." };
  if (state === "reversed") return { ok: false, error: "That document has already been taken back out." };

  const live = existing.filter((e) => !e.isReversal);
  const date = postingDay(input.reversalDate ?? live[0]?.postingDate ?? new Date());
  if (!date) return { ok: false, error: "A reversal needs a date." };

  const note = ["Reversal", reason].filter(Boolean).join(": ");

  const payload = live.map((e) => ({
    company_id: companyId,
    posting_date: date,
    account_id: e.accountId,
    // ⚠️ The swap. Everything else travels UNCHANGED — the party, the cost
    // centre, the project — or the reversal cancels the totals but not the
    // reports, and a customer statement would keep the debt for ever.
    debit: e.credit ?? "0",
    credit: e.debit ?? "0",
    currency: e.currency,
    ex_rate: e.exRate,
    debit_fx: e.creditFx,
    credit_fx: e.debitFx,
    party_type: e.partyType,
    party: e.party,
    cost_centre: e.costCentre,
    project_id: e.projectId,
    voucher_type: voucherType,
    voucher_id: voucherId,
    voucher_no: e.voucherNo,
    line_no: e.lineNo,
    remarks: [e.remarks, note].filter(Boolean).join(" · "),
    is_reversal: true,
    reverses_id: e.id,
    created_by: createdBy,
  }));

  const { error } = await sb.from("gl_entries").insert(payload);
  if (error) {
    if (error.message.includes("gl_entries_voucher_line_unique")) {
      return { ok: false, error: "That document has already been taken back out." };
    }
    return { ok: false, error: error.message };
  }

  await recordEvent("ledger.unposted", "ok", {
    companyId, voucherType, voucherId, lines: payload.length, reason, by: createdBy,
  });

  return { ok: true, entries: payload.length, voucherType, voucherId };
}

/* ═════════════════════════════════════════════════════════════ the alarm ═══ */

/**
 * Do the books balance?
 *
 * ⚠️ This should ALWAYS be true, because every voucher was checked before it
 * was written. A false is not a validation message to show a user — it means
 * something reached `gl_entries` without going through `postVoucher`, and it is
 * worth stopping everything to find out what.
 *
 * Cheap enough to run on the ledger screen every time, which is the point: an
 * accounting system that only notices at year end is not much of a warning.
 */
export async function booksBalance(companyId: number): Promise<{ ok: boolean; debit: number; credit: number; difference: number }> {
  const entries = await listEntries(companyId);
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    debit += Number(e.debit ?? 0);
    credit += Number(e.credit ?? 0);
  }
  debit = round2(debit);
  credit = round2(credit);
  const difference = round2(debit - credit);
  return { ok: Math.abs(difference) <= TOLERANCE, debit, credit, difference };
}
