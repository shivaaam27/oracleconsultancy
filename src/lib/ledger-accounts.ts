// ─────────────────────────────────────────────────────────────────────────────
// THE CHART OF ACCOUNTS — the reader and the writer (SERVER-ONLY, imports `sb`).
//
// ⚠️ Client components must import `ledger-shared.ts`, never this file. This one
// drags `@/db/supabase` into the bundle and every page dies with
// "SUPABASE_SERVICE_ROLE_KEY is not set".
//
// The chart is a tree per company, seeded from the one template in
// `ledger-coa-template.ts`. Nothing here computes a balance — that is
// `ledger-shared.ts`, on read, from the entries (rule 3).
// ─────────────────────────────────────────────────────────────────────────────

import { sb, fetchAllRows } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";
import { COA_TEMPLATE, type CoaTemplateRow } from "@/lib/ledger-coa-template";
import { isRootType, type GlAccount } from "@/lib/ledger-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type. (The same trap as every ops reader.)
const COLS = "id,company_id,number,name,parent_id,root_type,account_type,is_group,currency,default_for,notes,archived,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): GlAccount {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    number: (r.number as string) ?? "",
    name: (r.name as string) ?? "",
    parentId: (r.parent_id as number | null) ?? null,
    rootType: (r.root_type as string) ?? "Asset",
    accountType: s("account_type"),
    isGroup: Boolean(r.is_group),
    currency: s("currency"),
    defaultFor: s("default_for"),
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

/* ────────────────────────────────────────────────────────────── reading ─── */

/**
 * Every account for a company.
 *
 * ⚠️ `fetchAllRows`, not a plain select. A thirteen-company group on a chart
 * this size is already near the 1,000-row cap that PostgREST applies without
 * saying so — the fault that hid a whole year of enquiries in Aug 2026.
 */
export async function listAccounts(
  companyId: number, opts: { includeArchived?: boolean } = {},
): Promise<GlAccount[]> {
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("gl_accounts").select(COLS).eq("company_id", companyId);
    if (!opts.includeArchived) q = q.eq("archived", false);
    return q.order("number", { ascending: true }).range(from, to);
  });
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

/** Accounts across several companies at once — for the consolidated reports. */
export async function listAccountsForCompanies(companyIds: number[]): Promise<GlAccount[]> {
  if (companyIds.length === 0) return [];
  const rows = await fetchAllRows((from, to) =>
    sb.from("gl_accounts").select(COLS).in("company_id", companyIds)
      .order("company_id").order("number").range(from, to));
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function getAccount(id: number): Promise<GlAccount | null> {
  const { data } = await sb.from("gl_accounts").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export function accountsById(accounts: GlAccount[]): Map<number, GlAccount> {
  return new Map(accounts.map((a) => [a.id, a]));
}

/**
 * The account that plays a role — "which one is debtors?".
 *
 * ⚠️ How every later phase finds an account WITHOUT hard-coding a number. When
 * the sales invoice starts posting in Phase 5 it asks for `receivable`, and a
 * company that has renamed or renumbered its debtors account still works.
 *
 * Returns null rather than guessing. A posting engine that guesses which
 * account to use is worse than one that refuses.
 */
export async function defaultAccount(companyId: number, role: string): Promise<GlAccount | null> {
  const { data } = await sb.from("gl_accounts").select(COLS)
    .eq("company_id", companyId).eq("default_for", role).eq("archived", false).maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** True once a company has a chart at all. Drives the "Set it up" empty state. */
export async function hasChart(companyId: number): Promise<boolean> {
  const { count } = await sb.from("gl_accounts")
    .select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return (count ?? 0) > 0;
}

/** How many entries an account carries. ⚠️ Decides whether it may be deleted. */
export async function entryCount(accountId: number): Promise<number> {
  const { count } = await sb.from("gl_entries")
    .select("id", { count: "exact", head: true }).eq("account_id", accountId);
  return count ?? 0;
}

async function childCount(accountId: number): Promise<number> {
  const { count } = await sb.from("gl_accounts")
    .select("id", { count: "exact", head: true }).eq("parent_id", accountId);
  return count ?? 0;
}

/* ────────────────────────────────────────────────────────────── seeding ─── */

export type SeedResult = { ok: true; added: number; skipped: number } | { ok: false; error: string };

/**
 * Give a company its chart, from the shared template.
 *
 * ⚠️ **A TOP-UP, NOT A RESET.** It adds only the numbers the company does not
 * already have, and touches nothing that exists — no renames, no re-parenting,
 * no un-archiving. So it is safe to run again after the template grows, and it
 * can never quietly undo a change somebody made on purpose.
 *
 * ⚠️ Inserted PARENTS FIRST, level by level, because a child needs its parent's
 * id and the ids differ per company. The template is written in order, but this
 * does not rely on that — a row whose parent is not yet in the database waits
 * for the next pass.
 */
export async function seedChartOfAccounts(
  companyId: number,
  createdBy = "web-ui",
  template: CoaTemplateRow[] = COA_TEMPLATE,
): Promise<SeedResult> {
  const existing = await listAccounts(companyId, { includeArchived: true });
  const idByNumber = new Map(existing.map((a) => [a.number, a.id]));

  const missing = template.filter((r) => !idByNumber.has(r.number));
  if (missing.length === 0) return { ok: true, added: 0, skipped: template.length };

  let added = 0;
  let guard = 0;
  let queue = [...missing];

  while (queue.length > 0) {
    // ⚠️ The guard is not paranoia: a template row naming a parent that is not
    // in the template and not in the database would otherwise loop for ever.
    // `checkTemplate()` catches that in the tests; this catches it in production.
    if (guard++ > 50) {
      return { ok: false, error: `Could not place ${queue.length} account(s) — check the template's parents.` };
    }

    const ready = queue.filter((r) => r.parent === null || idByNumber.has(r.parent));
    if (ready.length === 0) {
      return { ok: false, error: `${queue.length} account(s) name a parent that does not exist.` };
    }

    const payload = ready.map((r) => ({
      company_id: companyId,
      number: r.number,
      name: r.name,
      parent_id: r.parent === null ? null : idByNumber.get(r.parent)!,
      root_type: r.rootType,
      account_type: r.accountType ?? null,
      is_group: r.isGroup ?? false,
      currency: null,
      default_for: r.defaultFor ?? null,
      notes: r.notes ?? null,
      created_by: createdBy,
    }));

    const { data, error } = await sb.from("gl_accounts").insert(payload).select("id,number");
    if (error) return { ok: false, error: error.message };

    for (const row of (data ?? []) as Array<{ id: number; number: string }>) {
      idByNumber.set(row.number, row.id);
    }
    added += payload.length;
    queue = queue.filter((r) => !idByNumber.has(r.number));
  }

  await recordEvent("ledger.chart-seeded", "ok", { companyId, added, by: createdBy });
  return { ok: true, added, skipped: template.length - added };
}

/* ────────────────────────────────────────────────────────────── writing ─── */

export type AccountFields = {
  companyId: number;
  number: string;
  name: string;
  parentId?: number | null;
  rootType: string;
  accountType?: string | null;
  isGroup?: boolean;
  currency?: string | null;
  defaultFor?: string | null;
  notes?: string | null;
  createdBy?: string;
};

function validate(f: Partial<AccountFields>): string | null {
  if (f.number !== undefined && !f.number.trim()) return "An account needs a number.";
  if (f.name !== undefined && !f.name.trim()) return "An account needs a name.";
  if (f.rootType !== undefined && !isRootType(f.rootType)) {
    return `"${f.rootType}" is not one of Asset, Liability, Equity, Income or Expense.`;
  }
  return null;
}

export async function createAccount(f: AccountFields): Promise<WriteResult> {
  const bad = validate(f);
  if (bad) return { ok: false, error: bad };

  // ⚠️ A child must sit under a GROUP and share its root type, or the tree
  // stops meaning anything and a group's total stops matching its children.
  if (f.parentId != null) {
    const parent = await getAccount(f.parentId);
    if (!parent) return { ok: false, error: "That parent account does not exist." };
    if (parent.companyId !== f.companyId) return { ok: false, error: "That parent belongs to another company." };
    if (!parent.isGroup) return { ok: false, error: `"${parent.name}" is not a heading — pick a group to file this under.` };
    if (parent.rootType !== f.rootType) {
      return { ok: false, error: `A ${f.rootType} account cannot sit under "${parent.name}", which is ${parent.rootType}.` };
    }
  }

  const { data, error } = await sb.from("gl_accounts").insert({
    company_id: f.companyId,
    number: f.number.trim(),
    name: f.name.trim(),
    parent_id: f.parentId ?? null,
    root_type: f.rootType,
    account_type: f.accountType ?? null,
    is_group: f.isGroup ?? false,
    currency: f.currency?.trim() || null,
    default_for: f.defaultFor?.trim() || null,
    notes: f.notes?.trim() || null,
    created_by: f.createdBy ?? "web-ui",
  }).select("id").maybeSingle();

  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id: (data as { id: number } | null)?.id };
}

export async function updateAccount(id: number, patch: Partial<AccountFields>): Promise<WriteResult> {
  const bad = validate(patch);
  if (bad) return { ok: false, error: bad };

  const current = await getAccount(id);
  if (!current) return { ok: false, error: "That account no longer exists." };

  const nextRoot = patch.rootType ?? current.rootType;

  // ⚠️ THE ROOT TYPE IS FROZEN ONCE THERE ARE ENTRIES. Moving an account from
  // Expense to Income after it has been posted to silently rewrites every
  // report that ever quoted it — last year's P&L would change. Make a new
  // account and journal the balance across instead.
  if (patch.rootType !== undefined && patch.rootType !== current.rootType) {
    if (await entryCount(id) > 0) {
      return {
        ok: false,
        error: "This account already has postings, so its type cannot change — every past report would change with it. Make a new account and journal the balance across.",
      };
    }
  }

  // ⚠️ A group with children may not become postable, and a postable account
  // with entries may not become a group.
  if (patch.isGroup !== undefined && patch.isGroup !== current.isGroup) {
    if (current.isGroup && await childCount(id) > 0) {
      return { ok: false, error: "This is a heading with accounts under it — move them first." };
    }
    if (!current.isGroup && await entryCount(id) > 0) {
      return { ok: false, error: "This account has postings, so it cannot become a heading." };
    }
  }

  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) return { ok: false, error: "An account cannot be filed under itself." };
    const parent = await getAccount(patch.parentId);
    if (!parent) return { ok: false, error: "That parent account does not exist." };
    if (parent.companyId !== current.companyId) return { ok: false, error: "That parent belongs to another company." };
    if (!parent.isGroup) return { ok: false, error: `"${parent.name}" is not a heading.` };
    if (parent.rootType !== nextRoot) {
      return { ok: false, error: `A ${nextRoot} account cannot sit under "${parent.name}", which is ${parent.rootType}.` };
    }
    if (await isDescendant(patch.parentId, id)) {
      return { ok: false, error: "That would put the account inside one of its own children." };
    }
  }

  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.number !== undefined) set.number = patch.number.trim();
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.parentId !== undefined) set.parent_id = patch.parentId;
  if (patch.rootType !== undefined) set.root_type = patch.rootType;
  if (patch.accountType !== undefined) set.account_type = patch.accountType || null;
  if (patch.isGroup !== undefined) set.is_group = patch.isGroup;
  if (patch.currency !== undefined) set.currency = patch.currency?.trim() || null;
  if (patch.defaultFor !== undefined) set.default_for = patch.defaultFor?.trim() || null;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;

  const { error } = await sb.from("gl_accounts").update(set).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id };
}

/** Would `candidate` end up inside `ancestor`? Guards a circular tree. */
async function isDescendant(candidate: number, ancestor: number): Promise<boolean> {
  let cur: number | null = candidate;
  for (let i = 0; cur !== null && i < 50; i++) {
    if (cur === ancestor) return true;
    const acc: GlAccount | null = await getAccount(cur);
    cur = acc?.parentId ?? null;
  }
  return false;
}

/**
 * Archive an account: no NEW postings, everything already posted still counts.
 *
 * ⚠️ Archiving does NOT remove an account from the trial balance. Its entries
 * are still facts and still add up. This only closes it to future use — which
 * is exactly what "we do not use that one any more" means.
 */
export async function archiveAccount(id: number, archived: boolean): Promise<WriteResult> {
  if (archived) {
    const kids = await childCount(id);
    if (kids > 0) return { ok: false, error: "This is a heading with accounts under it — archive those first." };
  }
  const { error } = await sb.from("gl_accounts")
    .update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id };
}

/**
 * Delete an account outright.
 *
 * ⚠️ ONLY ever a typo-eraser. Refused the moment the account has a single
 * posting or a single child — archive is the answer then, and the error says
 * so. An account with entries can never be removed by any path in this
 * codebase, and the `restrict` foreign key on `gl_entries.account_id` means the
 * database would refuse even if this check were bypassed.
 */
export async function deleteAccount(id: number): Promise<WriteResult> {
  const entries = await entryCount(id);
  if (entries > 0) {
    return { ok: false, error: `This account has ${entries} posting${entries === 1 ? "" : "s"} and can never be deleted. Archive it instead.` };
  }
  const kids = await childCount(id);
  if (kids > 0) return { ok: false, error: "This is a heading with accounts under it — deal with those first." };

  const { error } = await sb.from("gl_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id };
}

/** Turn a Postgres constraint into something a person can act on. */
function friendly(message: string): string {
  if (message.includes("gl_accounts_number_unique")) {
    return "That account number is already used in this company.";
  }
  if (message.includes("gl_accounts_default_unique")) {
    return "Another account already has that role. Clear it there first — there can only be one.";
  }
  return message;
}
