// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRIES — the manual voucher (SERVER-ONLY, imports `sb`). Phase 1.
//
// A journal entry is how anything gets corrected, and how anything that has no
// document of its own gets into the books: a depreciation charge, an accrual, a
// director's introduction of capital, and — in Phase 6 — the opening balances.
//
// Its life is exactly two states and one door between them:
//
//   **Draft** — edit it freely, delete it, it touches nothing.
//   **Post**  — `postVoucher()` writes the entries. From this moment the entry
//               is frozen. Not "locked in the UI": every writer below refuses.
//   **Reverse** — a SECOND journal entry, sides swapped, pointing back at the
//               first. Both stay. Neither is ever deleted.
//
// ⚠️ There is no "edit a posted entry", no "unpost and edit", and no delete
// after posting. That is rule 2, and it is also just how books work.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, fetchAllRows } from "@/db/supabase";
import { listAccounts } from "@/lib/ledger-accounts";
import { postVoucher, voucherStateOf } from "@/lib/ledger-post";
import {
  checkVoucher, nextVoucherNo, num, postingDay, voucherTotals,
  type GlAccount, type JournalEntry, type JournalLine, type VoucherLine,
} from "@/lib/ledger-shared";

export type WriteResult = { ok: true; id?: number; entryNo?: string } | { ok: false; error: string; errors?: string[] };

/** The document type these post under. ⚠️ Must never change — it is written
 *  into every `gl_entries` row a journal has ever made. */
export const JOURNAL_VOUCHER_TYPE = "Journal Entry";

const COLS = "id,company_id,entry_no,posting_date,title,narration,kind,status,currency,ex_rate,posted_at,posted_by,reversal_of_id,archived,created_by,created_at,updated_at";
const LINE_COLS = "id,entry_id,account_id,debit,credit,party_type,party,cost_centre,project_id,remarks,sort_order";

function mapEntry(r: Record<string, unknown>): JournalEntry {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    entryNo: (r.entry_no as string) ?? "",
    postingDate: s("posting_date"),
    title: s("title"),
    narration: s("narration"),
    kind: (r.kind as string) ?? "Manual",
    status: (r.status as string) ?? "Draft",
    currency: s("currency"),
    exRate: s("ex_rate"),
    postedAt: s("posted_at"),
    postedBy: s("posted_by"),
    reversalOfId: (r.reversal_of_id as number | null) ?? null,
    archived: Boolean(r.archived),
  };
}

function mapLine(r: Record<string, unknown>): JournalLine {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    entryId: r.entry_id as number,
    accountId: r.account_id as number,
    debit: s("debit"),
    credit: s("credit"),
    partyType: s("party_type"),
    party: s("party"),
    costCentre: s("cost_centre"),
    projectId: (r.project_id as number | null) ?? null,
    remarks: s("remarks"),
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

/* ────────────────────────────────────────────────────────────── reading ─── */

export async function listJournalEntries(
  companyId: number, opts: { status?: string; includeArchived?: boolean } = {},
): Promise<JournalEntry[]> {
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("journal_entries").select(COLS).eq("company_id", companyId);
    if (!opts.includeArchived) q = q.eq("archived", false);
    if (opts.status) q = q.eq("status", opts.status);
    return q.order("posting_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }).range(from, to);
  });
  return rows.map((r) => mapEntry(r as Record<string, unknown>));
}

export async function getJournalEntry(id: number): Promise<{ entry: JournalEntry; lines: JournalLine[] } | null> {
  const { data } = await sb.from("journal_entries").select(COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const lines = await journalLines(id);
  return { entry: mapEntry(data as Record<string, unknown>), lines };
}

export async function journalLines(entryId: number): Promise<JournalLine[]> {
  const { data } = await sb.from("journal_entry_lines").select(LINE_COLS)
    .eq("entry_id", entryId).order("sort_order").order("id");
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapLine);
}

/** Lines for many entries at once — so a list can show totals without N queries. */
export async function linesByEntry(entryIds: number[]): Promise<Map<number, JournalLine[]>> {
  const out = new Map<number, JournalLine[]>();
  if (entryIds.length === 0) return out;
  const rows = await fetchAllRows((from, to) =>
    sb.from("journal_entry_lines").select(LINE_COLS).in("entry_id", entryIds)
      .order("entry_id").order("sort_order").range(from, to));
  for (const r of rows as Array<Record<string, unknown>>) {
    const l = mapLine(r);
    const b = out.get(l.entryId);
    if (b) b.push(l); else out.set(l.entryId, [l]);
  }
  return out;
}

/**
 * The entry that reverses this one, if there is one.
 *
 * ⚠️ Derived, not stored (rule 3). The schema has `reversal_of_id` on the
 * reversal only; a `reversed_by_id` on the original would be a second copy of
 * the same fact and the two would eventually disagree.
 */
export async function reversalOf(entryId: number): Promise<JournalEntry | null> {
  const { data } = await sb.from("journal_entries").select(COLS)
    .eq("reversal_of_id", entryId).maybeSingle();
  return data ? mapEntry(data as Record<string, unknown>) : null;
}

/* ────────────────────────────────────────────────────────────── numbering ── */

async function allocateEntryNo(companyId: number): Promise<string> {
  const rows = await fetchAllRows((from, to) =>
    sb.from("journal_entries").select("entry_no").eq("company_id", companyId).range(from, to));
  return nextVoucherNo((rows as Array<{ entry_no: string }>).map((r) => r.entry_no), "JV");
}

/* ────────────────────────────────────────────────────────────── writing ─── */

export type JournalLineInput = {
  accountId: number;
  debit?: number | string | null;
  credit?: number | string | null;
  partyType?: string | null;
  party?: string | null;
  costCentre?: string | null;
  projectId?: number | null;
  remarks?: string | null;
};

export type JournalFields = {
  companyId: number;
  postingDate: string;
  title?: string | null;
  narration?: string | null;
  kind?: string;
  currency?: string | null;
  exRate?: number | string | null;
  lines?: JournalLineInput[];
  createdBy?: string;
};

/** A draft. ⚠️ Nothing is checked yet on purpose — a half-typed journal must be
 *  saveable, or the screen becomes a form you cannot put down. The checking
 *  happens at Post, which is the moment it matters. */
export async function createJournalEntry(f: JournalFields): Promise<WriteResult> {
  const date = postingDay(f.postingDate);
  if (!date) return { ok: false, error: "A journal entry needs a date." };

  // ⚠️ Retried: the number is picked by reading the existing ones, so two
  // drafts started at the same instant could pick the same one. The unique
  // index refuses the second, and this simply tries again with the next.
  for (let attempt = 0; attempt < 3; attempt++) {
    const entryNo = await allocateEntryNo(f.companyId);
    const { data, error } = await sb.from("journal_entries").insert({
      company_id: f.companyId,
      entry_no: entryNo,
      posting_date: date,
      title: f.title?.trim() || null,
      narration: f.narration?.trim() || null,
      kind: f.kind ?? "Manual",
      status: "Draft",
      currency: f.currency?.trim() || null,
      ex_rate: f.exRate != null && f.exRate !== "" ? String(f.exRate) : null,
      created_by: f.createdBy ?? "web-ui",
    }).select("id").maybeSingle();

    if (error) {
      if (error.message.includes("journal_entries_no_unique")) continue;
      return { ok: false, error: error.message };
    }
    const id = (data as { id: number } | null)?.id;
    if (id && f.lines?.length) {
      const res = await replaceJournalLines(id, f.lines);
      if (!res.ok) return res;
    }
    return { ok: true, id, entryNo };
  }
  return { ok: false, error: "Could not allocate a journal number — try again." };
}

/** ⚠️ Refuses once posted. Rule 2, in the one place a caller could break it. */
export async function updateJournalEntry(id: number, patch: Partial<JournalFields>): Promise<WriteResult> {
  const guard = await mustBeDraft(id);
  if (guard) return guard;

  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.postingDate !== undefined) {
    const d = postingDay(patch.postingDate);
    if (!d) return { ok: false, error: "That is not a date." };
    set.posting_date = d;
  }
  if (patch.title !== undefined) set.title = patch.title?.trim() || null;
  if (patch.narration !== undefined) set.narration = patch.narration?.trim() || null;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.currency !== undefined) set.currency = patch.currency?.trim() || null;
  if (patch.exRate !== undefined) {
    set.ex_rate = patch.exRate != null && patch.exRate !== "" ? String(patch.exRate) : null;
  }

  const { error } = await sb.from("journal_entries").update(set).eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (patch.lines) {
    const res = await replaceJournalLines(id, patch.lines);
    if (!res.ok) return res;
  }
  return { ok: true, id };
}

/**
 * Swap the whole set of lines for a draft.
 *
 * Replace rather than patch: a journal is read as a whole, the grid on screen
 * IS the set of lines, and reconciling row-by-row would be more code and more
 * ways to be wrong for no gain. ⚠️ Draft only.
 */
export async function replaceJournalLines(entryId: number, lines: JournalLineInput[]): Promise<WriteResult> {
  const guard = await mustBeDraft(entryId);
  if (guard) return guard;

  await sb.from("journal_entry_lines").delete().eq("entry_id", entryId);
  const usable = lines.filter((l) => l.accountId);
  if (usable.length === 0) return { ok: true, id: entryId };

  const payload = usable.map((l, i) => ({
    entry_id: entryId,
    account_id: l.accountId,
    debit: (num(l.debit) ?? 0).toFixed(2),
    credit: (num(l.credit) ?? 0).toFixed(2),
    party_type: l.partyType ?? null,
    party: l.party?.trim() || null,
    cost_centre: l.costCentre?.trim() || null,
    project_id: l.projectId ?? null,
    remarks: l.remarks?.trim() || null,
    sort_order: i,
  }));

  const { error } = await sb.from("journal_entry_lines").insert(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: entryId };
}

/** ⚠️ Draft only, and it takes the lines with it (the FK cascades). A posted
 *  entry is never deleted — reverse it. */
export async function deleteJournalEntry(id: number): Promise<WriteResult> {
  const guard = await mustBeDraft(id);
  if (guard) return guard;
  const { error } = await sb.from("journal_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

async function mustBeDraft(id: number): Promise<WriteResult | null> {
  const { data } = await sb.from("journal_entries").select("status,entry_no").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "That journal entry no longer exists." };
  const status = (data as { status: string }).status;
  if (status !== "Draft") {
    return {
      ok: false,
      error: `${(data as { entry_no: string }).entry_no} is already in the books and can never be changed. Reverse it and write a new one.`,
    };
  }
  return null;
}

/* ────────────────────────────────────────────────────────── posting ─────── */

/**
 * Check a draft WITHOUT writing anything — what the Post button reads.
 *
 * ⚠️ The same `checkVoucher()` the engine runs, against the same accounts, so
 * the screen can never say "ready" to something the engine will refuse.
 */
export async function checkJournalEntry(
  id: number, accounts?: GlAccount[],
): Promise<{ ok: boolean; errors: string[]; debit: number; credit: number; difference: number }> {
  const found = await getJournalEntry(id);
  if (!found) return { ok: false, errors: ["That journal entry no longer exists."], debit: 0, credit: 0, difference: 0 };

  const acc = accounts ?? await listAccounts(found.entry.companyId, { includeArchived: true });
  const lines = toVoucherLines(found.lines);
  const totals = voucherTotals(lines);
  const check = checkVoucher(lines, acc, { companyId: found.entry.companyId });
  return {
    ok: check.ok,
    errors: check.ok ? [] : check.errors,
    debit: totals.debit,
    credit: totals.credit,
    difference: totals.difference,
  };
}

export function toVoucherLines(lines: JournalLine[]): VoucherLine[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: num(l.debit) ?? 0,
    credit: num(l.credit) ?? 0,
    partyType: l.partyType,
    party: l.party,
    costCentre: l.costCentre,
    projectId: l.projectId,
    remarks: l.remarks,
  }));
}

/**
 * **Post a draft into the books.**
 *
 * ⚠️ The status is set AFTER the entries land, which is the only order that is
 * safe: a crash between the two leaves entries with a Draft label, which the
 * self-heal below repairs on the next attempt. The other order would leave a
 * "Posted" journal with nothing in the books, which nobody would ever notice.
 */
export async function postJournalEntry(id: number, by = "web-ui"): Promise<WriteResult> {
  const found = await getJournalEntry(id);
  if (!found) return { ok: false, error: "That journal entry no longer exists." };
  const { entry, lines } = found;

  if (entry.status === "Posted") return { ok: false, error: `${entry.entryNo} is already in the books.` };
  if (entry.status === "Reversed") return { ok: false, error: `${entry.entryNo} was reversed and cannot be posted again.` };

  // Self-heal: entries exist but the label says Draft — the crash case above.
  const state = await voucherStateOf(entry.companyId, JOURNAL_VOUCHER_TYPE, entry.id);
  if (state !== "unposted") {
    await markPosted(id, by);
    return { ok: true, id, entryNo: entry.entryNo };
  }

  const res = await postVoucher({
    companyId: entry.companyId,
    voucherType: JOURNAL_VOUCHER_TYPE,
    voucherId: entry.id,
    voucherNo: entry.entryNo,
    postingDate: entry.postingDate ?? new Date(),
    lines: toVoucherLines(lines),
    currency: entry.currency,
    exRate: num(entry.exRate),
    remarks: entry.narration,
    createdBy: by,
  });
  if (!res.ok) return { ok: false, error: res.error, errors: res.errors };

  await markPosted(id, by);
  return { ok: true, id, entryNo: entry.entryNo };
}

async function markPosted(id: number, by: string): Promise<void> {
  await sb.from("journal_entries").update({
    status: "Posted",
    posted_at: new Date().toISOString(),
    posted_by: by,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

/**
 * **Reverse a posted journal — by writing a new one, not by undoing the old.**
 *
 * The reversal is a real, visible document with its own number, its own date
 * and its own narration, pointing back at what it undoes. That is what an
 * accountant expects to find, and it means the correction can be explained on
 * the correction itself rather than in somebody's memory.
 *
 * ⚠️ The reversal defaults to the ORIGINAL date, so the month the mistake was
 * made in nets back to nothing. Pass a later date when that period has been
 * reported and must not move — a decision for whoever signs the accounts.
 */
export async function reverseJournalEntry(
  id: number,
  opts: { date?: string | null; reason?: string | null; by?: string } = {},
): Promise<WriteResult> {
  const by = opts.by ?? "web-ui";
  const found = await getJournalEntry(id);
  if (!found) return { ok: false, error: "That journal entry no longer exists." };
  const { entry, lines } = found;

  if (entry.status === "Draft") {
    return { ok: false, error: `${entry.entryNo} is still a draft — change it, or delete it. There is nothing to reverse.` };
  }
  const existing = await reversalOf(id);
  if (existing) return { ok: false, error: `${entry.entryNo} was already reversed by ${existing.entryNo}.` };

  const date = postingDay(opts.date ?? entry.postingDate ?? new Date());
  if (!date) return { ok: false, error: "A reversal needs a date." };

  const created = await createJournalEntry({
    companyId: entry.companyId,
    postingDate: date,
    title: `Reversal of ${entry.entryNo}`,
    narration: [opts.reason, entry.narration ? `(reverses: ${entry.narration})` : null]
      .filter(Boolean).join(" ") || `Reverses ${entry.entryNo}`,
    kind: "Reversal",
    currency: entry.currency,
    exRate: entry.exRate,
    // ⚠️ The sides swap; the account, party, cost centre and project do NOT.
    // A reversal has to land in exactly the same places or it cancels the
    // totals and leaves the statements untouched.
    lines: lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      partyType: l.partyType,
      party: l.party,
      costCentre: l.costCentre,
      projectId: l.projectId,
      remarks: l.remarks,
    })),
    createdBy: by,
  });
  if (!created.ok) return created;
  const newId = created.id!;

  const { error: linkErr } = await sb.from("journal_entries")
    .update({ reversal_of_id: id }).eq("id", newId);
  if (linkErr) return { ok: false, error: linkErr.message };

  const posted = await postJournalEntry(newId, by);
  if (!posted.ok) {
    // ⚠️ The reversal could not be posted, so it stays a DRAFT rather than
    // vanishing — somebody must see that the correction did not land. The
    // original is untouched and still correct in the books.
    return { ok: false, error: `The reversal ${created.entryNo} was drafted but could not be posted: ${posted.error}` };
  }

  await sb.from("journal_entries").update({
    status: "Reversed", updated_at: new Date().toISOString(),
  }).eq("id", id);

  return { ok: true, id: newId, entryNo: created.entryNo };
}
