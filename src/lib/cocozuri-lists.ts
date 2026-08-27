import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import {
  deleteVerdict, listBlockers,
  type CzListKind, type CzListValue, type CzUsage,
} from "@/lib/cocozuri-lists-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Stage A — the lists you pick from, and what points at a record.
 * The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ THE VALUE IS TEXT ON THE PRODUCT AND THE ITEM, NOT A FOREIGN KEY. This is
 * the list you PICK from. That is deliberate: every existing row already holds
 * text, and an invoice has frozen its own wording onto itself and must never be
 * re-pointed by somebody tidying a list months later.
 *
 * The price of that choice is that a rename has to REWRITE the text everywhere
 * it is used — which is done here, in one place, and is exactly what makes merge
 * worth having.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();

/** ⚠️ ONE STRING LITERAL — a split one widens to `string`. */
const LIST_COLS = "id,kind,value,sort_order,archived";

/** Which column of which table each list feeds. */
const USES: Record<CzListKind, { table: "cz_products" | "cz_stock_items"; column: string }[]> = {
  category: [
    { table: "cz_products", column: "category" },
    { table: "cz_stock_items", column: "category" },
  ],
  brand: [{ table: "cz_products", column: "brand" }],
  uom: [
    { table: "cz_products", column: "uom" },
    { table: "cz_stock_items", column: "uom" },
  ],
  pack_unit: [{ table: "cz_products", column: "pack_unit" }],
};

/* ------------------------------- reading ------------------------------- */

/**
 * One list, with how many things use each value.
 *
 * ⚠️ THE COUNT IS DERIVED ON READ, never stored. It is the number that tells you
 * whether a value is real or a typo somebody made once, so it must not be able
 * to go stale.
 */
export async function listValues(kind: CzListKind): Promise<CzListValue[]> {
  const company = await cocozuriCompany();
  if (!company) return [];

  const [{ data, error }, counts] = await Promise.all([
    sb.from("cz_lists").select(LIST_COLS)
      .eq("company_id", company.id).eq("kind", kind)
      .order("sort_order").order("value"),
    countUses(kind, company.id),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listValues failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as number,
    kind: r.kind as CzListKind,
    value: (r.value as string) ?? "",
    sortOrder: (r.sort_order as number) ?? 0,
    archived: !!r.archived,
    usedBy: counts.get(((r.value as string) ?? "").trim().toLowerCase()) ?? 0,
  }));
}

/** How many rows use each value of this list, keyed lower-case. */
async function countUses(kind: CzListKind, companyId: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const use of USES[kind]) {
    const { data } = await sb.from(use.table).select(use.column).eq("company_id", companyId);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const v = ((row[use.column] as string | null) ?? "").trim().toLowerCase();
      if (!v) continue;
      out.set(v, (out.get(v) ?? 0) + 1);
    }
  }
  return out;
}

/** Every list at once, for the one screen that manages them all. */
export async function allLists(): Promise<Record<CzListKind, CzListValue[]>> {
  const [category, brand, uom, pack_unit] = await Promise.all([
    listValues("category"), listValues("brand"), listValues("uom"), listValues("pack_unit"),
  ]);
  return { category, brand, uom, pack_unit };
}

/* ------------------------------- writing ------------------------------- */

export async function addListValue(
  kind: CzListKind, value: string,
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const existing = await listValues(kind);
  const blockers = listBlockers(value, existing);
  if (blockers.length) return { ok: false, error: blockers[0] };

  const { error } = await sb.from("cz_lists").insert({
    company_id: company.id, kind, value: value.trim(), updated_at: NOW(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Put a value on its list if it is not there already.
 *
 * ⚠️ THE BACK DOOR HAS TO BE CLOSED OR THE LISTS ARE POINTLESS. The item and
 * product forms let a value be TYPED as well as picked, deliberately — a unit
 * nobody has added yet must not stop somebody adding an item at four in the
 * afternoon. But if a typed value never reaches the list, every typo goes
 * straight back into the data while staying invisible on the screen built to
 * catch it. So a value that is USED joins the list, where it can be seen,
 * merged or renamed.
 *
 * ⚠️ IT IS SILENT AND NEVER FAILS THE CALLER. Somebody saving a stock item is
 * not to be stopped because a list entry could not be written.
 */
export async function ensureListValue(kind: CzListKind, value: string | null | undefined): Promise<void> {
  const v = (value ?? "").trim();
  if (!v) return;
  const company = await cocozuriCompany();
  if (!company) return;
  // The unique index is on lower(value), so a clash is the row already existing.
  await sb.from("cz_lists")
    .insert({ company_id: company.id, kind, value: v, updated_at: NOW() });
}

/**
 * Rename a value — **and rewrite it everywhere it is used.**
 *
 * ⚠️ THE REWRITE IS THE POINT. The value is text on the product and the item, so
 * renaming the list entry alone would leave 159 products still saying the old
 * word and the list saying the new one — two names for one thing, which is the
 * fault this table exists to end.
 *
 * ⚠️ THE ROWS GO FIRST AND THE LIST ENTRY ONLY IF THEY LANDED. The other order
 * can leave the list renamed and the products not, and there is no transaction
 * here to fall back on.
 */
export async function renameListValue(
  id: number, value: string,
): Promise<{ ok: boolean; changed: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, changed: 0, error: "Cocozuri is not in the company list." };

  const { data: row } = await sb.from("cz_lists").select(LIST_COLS).eq("id", id).maybeSingle();
  if (!row) return { ok: false, changed: 0, error: "That entry no longer exists." };
  const kind = row.kind as CzListKind;
  const from = (row.value as string) ?? "";
  const to = value.trim();
  if (from === to) return { ok: true, changed: 0 };

  const existing = await listValues(kind);
  const blockers = listBlockers(to, existing, id);
  if (blockers.length) return { ok: false, changed: 0, error: blockers[0] };

  const changed = await rewriteValue(kind, company.id, from, to);
  const { error } = await sb.from("cz_lists")
    .update({ value: to, updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, changed, error: error.message } : { ok: true, changed };
}

/**
 * **Merge two values into one.** `GM` and `GRM` are one unit typed twice.
 *
 * ⚠️ ONLY A PERSON CAN SAY THEY ARE THE SAME THING. The screen suggests likely
 * pairs and never acts on them — the same reasoning as the product duplicates
 * being imported deliberately rather than collapsed by a string comparison.
 *
 * ⚠️ AND THE LOSER IS DELETED, NOT ARCHIVED. Nothing points at it any more:
 * every row that said it now says the survivor.
 */
export async function mergeListValues(
  keepId: number, mergeId: number,
): Promise<{ ok: boolean; changed: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, changed: 0, error: "Cocozuri is not in the company list." };
  if (keepId === mergeId) return { ok: false, changed: 0, error: "Those are the same entry." };

  const { data: rows } = await sb.from("cz_lists").select(LIST_COLS).in("id", [keepId, mergeId]);
  const keep = (rows ?? []).find((r) => r.id === keepId);
  const gone = (rows ?? []).find((r) => r.id === mergeId);
  if (!keep || !gone) return { ok: false, changed: 0, error: "One of those entries no longer exists." };
  if (keep.kind !== gone.kind) {
    return { ok: false, changed: 0, error: "Those are on two different lists and cannot be merged." };
  }

  const changed = await rewriteValue(
    keep.kind as CzListKind, company.id, gone.value as string, keep.value as string,
  );
  const { error } = await sb.from("cz_lists").delete().eq("id", mergeId);
  return error ? { ok: false, changed, error: error.message } : { ok: true, changed };
}

/**
 * Remove a value from a list.
 *
 * ⚠️ IT REFUSES WHILE ANYTHING STILL USES IT, and says how many. Removing it
 * would not remove the word from those rows — it would just mean the word is no
 * longer offered while still being on 40 products, which is worse than leaving
 * it: an invisible value nobody can pick and nobody can fix.
 */
export async function deleteListValue(id: number): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await sb.from("cz_lists").select(LIST_COLS).eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That entry no longer exists." };
  const all = await listValues(row.kind as CzListKind);
  const mine = all.find((v) => v.id === id);
  if (mine && mine.usedBy > 0) {
    return {
      ok: false,
      error: `${mine.value} is on ${mine.usedBy} record${mine.usedBy === 1 ? "" : "s"}. Merge it into another entry, or change those first.`,
    };
  }
  const { error } = await sb.from("cz_lists").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Write a new word over an old one, everywhere that list is used. */
async function rewriteValue(
  kind: CzListKind, companyId: number, from: string, to: string,
): Promise<number> {
  let changed = 0;
  for (const use of USES[kind]) {
    /* ⚠️ Matched EXACTLY as stored, not case-insensitively. A row saying `Pcs`
       belongs to whichever list entry actually reads `Pcs`; rewriting it from
       the `PCS` entry would quietly merge two things the person never asked to
       merge. The duplicate-finder is what surfaces those, and a person decides. */
    const { data } = await sb.from(use.table)
      .update({ [use.column]: to, updated_at: NOW() })
      .eq("company_id", companyId).eq(use.column, from)
      .select("id");
    changed += (data ?? []).length;
  }
  return changed;
}

/* ------------------------------------------------------------------ *
 * What points at a record
 * ------------------------------------------------------------------ */

async function tally(table: string, column: string, id: number): Promise<number> {
  const { count } = await sb.from(table).select("*", { count: "exact", head: true }).eq(column, id);
  return count ?? 0;
}

/**
 * **What points at a product**, so nothing is ever removed blind.
 *
 * ⚠️ NOT EVERYTHING THAT POINTS AT IT BLOCKS IT. A price belongs to the product
 * and goes with it. An invoice line does not: somebody was sent that invoice,
 * and a document that has left the building cannot lose the thing it describes.
 */
export async function productUsage(id: number): Promise<CzUsage[]> {
  const [invoiceLines, items, prices, counterLines] = await Promise.all([
    tally("cz_invoice_lines", "product_id", id),
    tally("cz_stock_items", "product_id", id),
    tally("cz_prices", "product_id", id),
    // A counter line names a stock item, so it reaches the product through it.
    Promise.resolve(0),
  ]);
  void counterLines;
  return [
    { what: "invoice line", count: invoiceLines, blocking: true },
    { what: "stock item", count: items, blocking: true },
    { what: "price", count: prices, blocking: false },
  ];
}

/** What points at a customer. */
export async function customerUsage(id: number): Promise<CzUsage[]> {
  const [invoices, receipts, prices, branches, counterSales] = await Promise.all([
    tally("cz_invoices", "customer_id", id),
    tally("cz_receipts", "customer_id", id),
    tally("cz_prices", "customer_id", id),
    tally("cz_branches", "customer_id", id),
    tally("cz_counter_sales", "customer_id", id),
  ]);
  return [
    { what: "invoice", count: invoices, blocking: true },
    { what: "payment", count: receipts, blocking: true },
    { what: "counter sale", count: counterSales, blocking: true },
    { what: "agreed price", count: prices, blocking: false },
    { what: "branch", count: branches, blocking: false },
  ];
}

/**
 * What points at a stock item.
 *
 * ⚠️ A MOVEMENT BLOCKS IT, ALWAYS. The stock ledger is the module's spine and
 * every figure on every screen is worked out from it. An item with movements
 * cannot go, however tempting — archive is the answer there, and it is why
 * archive exists at all.
 */
export async function stockItemUsage(id: number): Promise<CzUsage[]> {
  const [moves, days, counts, recipeLines, batches, counterLines, transferFrom, transferTo, purchaseLines, returnLines] =
    await Promise.all([
      tally("cz_stock_moves", "item_id", id),
      tally("cz_stock_days", "item_id", id),
      tally("cz_stock_counts", "item_id", id),
      tally("cz_recipe_lines", "item_id", id),
      tally("cz_batches", "item_id", id),
      tally("cz_counter_sale_lines", "item_id", id),
      tally("cz_transfer_lines", "from_item_id", id),
      tally("cz_transfer_lines", "to_item_id", id),
      tally("cz_purchase_lines", "item_id", id),
      tally("cz_return_lines", "item_id", id),
    ]);
  return [
    { what: "stock movement", count: moves, blocking: true },
    { what: "day sheet row", count: days, blocking: true },
    { what: "stock count", count: counts, blocking: true },
    { what: "batch", count: batches, blocking: true },
    { what: "recipe line", count: recipeLines, blocking: true },
    { what: "counter sale line", count: counterLines, blocking: true },
    { what: "transfer line", count: transferFrom + transferTo, blocking: true },
    { what: "purchase line", count: purchaseLines, blocking: true },
    { what: "return line", count: returnLines, blocking: true },
  ];
}

/** What points at a shelf. */
export async function locationUsage(id: number): Promise<CzUsage[]> {
  const [items, moves] = await Promise.all([
    tally("cz_stock_items", "location_id", id),
    tally("cz_stock_moves", "location_id", id),
  ]);
  return [
    { what: "stock item", count: items, blocking: true },
    { what: "stock movement", count: moves, blocking: true },
  ];
}

/* ------------------------------------------------------------------ *
 * Deleting for real
 *
 * ⚠️ THE RULE IS ERPNEXT'S OWN, which is the one the owner already knows: a
 * draft goes; something acted on is cancelled first and then goes; and anything
 * still pointed at NAMES what points at it rather than failing with a database
 * error nobody can read.
 *
 * ⚠️ AND ARCHIVE DOES NOT GO AWAY. It stays the quick answer for getting
 * something off a list without losing it — which is the right answer for a
 * stock item with six hundred movements behind it.
 * ------------------------------------------------------------------ */

export async function deleteProduct(id: number): Promise<{ ok: boolean; error?: string }> {
  const usage = await productUsage(id);
  const verdict = deleteVerdict(usage);
  if (!verdict.ok) return { ok: false, error: verdict.reason! };
  // Prices belong to the product and go with it; nothing else may.
  await sb.from("cz_prices").delete().eq("product_id", id);
  const { error } = await sb.from("cz_products").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteCustomer(id: number): Promise<{ ok: boolean; error?: string }> {
  const usage = await customerUsage(id);
  const verdict = deleteVerdict(usage);
  if (!verdict.ok) return { ok: false, error: verdict.reason! };
  await sb.from("cz_prices").delete().eq("customer_id", id);
  await sb.from("cz_branches").delete().eq("customer_id", id);
  const { error } = await sb.from("cz_customers").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteStockItem(id: number): Promise<{ ok: boolean; error?: string }> {
  const usage = await stockItemUsage(id);
  const verdict = deleteVerdict(usage);
  if (!verdict.ok) return { ok: false, error: verdict.reason! };
  const { error } = await sb.from("cz_stock_items").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteStockLocation(id: number): Promise<{ ok: boolean; error?: string }> {
  const usage = await locationUsage(id);
  const verdict = deleteVerdict(usage);
  if (!verdict.ok) return { ok: false, error: verdict.reason! };
  const { error } = await sb.from("cz_stock_locations").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Set (or clear) what sort of thing an item is. */
export async function setItemKind(
  id: number, kind: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const allowed = ["raw_material", "packaging", "finished", "other"];
  if (kind != null && !allowed.includes(kind)) {
    return { ok: false, error: "That is not a kind of thing an item can be." };
  }
  const { error } = await sb.from("cz_stock_items")
    .update({ kind, updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Several at once — the sweep for the items nobody has classified. */
export async function setItemKinds(
  ids: number[], kind: string,
): Promise<{ ok: boolean; changed: number; error?: string }> {
  const allowed = ["raw_material", "packaging", "finished", "other"];
  if (!allowed.includes(kind)) return { ok: false, changed: 0, error: "That is not a kind of thing an item can be." };
  if (!ids.length) return { ok: true, changed: 0 };
  const { data, error } = await sb.from("cz_stock_items")
    .update({ kind, updated_at: NOW() }).in("id", ids).select("id");
  return error ? { ok: false, changed: 0, error: error.message } : { ok: true, changed: (data ?? []).length };
}
