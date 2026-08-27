/* ------------------------------------------------------------------ *
 * Reading the chef's costing workbook.
 *
 * `Item Costing Calculation.xlsx` holds 174 recipes across six sheets, written
 * the way a kitchen writes them: a name, a list of materials with a quantity
 * each, and a yield in the title. This turns a pasted sheet into recipes COS can
 * hold — and stops there. A person confirms every one.
 *
 * ⚠️ CLIENT-SAFE. No `sb`, no database, no side effects. The server half is
 * `cocozuri-recipe.ts`, which is still the one door for writes.
 *
 * ⚠️ THE PRICES IN THE WORKBOOK ARE READ AND THROWN AWAY, ON PURPOSE. Every
 * line there carries its own typed price, which is why the same butter is
 * costed at 28 a gram in 82 recipes and 82.34 in one, and why one cooking cream
 * appears at 6.30, 12.50 and 13.00. A recipe in COS has no cost column at all:
 * it costs itself on read from what was actually paid. Importing those numbers
 * would carry the disagreement in with them.
 *
 * ⚠️ NOTHING IS MATCHED FUZZILY AND NOTHING IS CREATED. A name is matched on
 * case and spacing; anything else is a SUGGESTION a person accepts or changes.
 * Matching stock by name is fault #4 — see `memory/cocozuri_ops_plan.md`.
 * ------------------------------------------------------------------ */

import { normaliseItemName, type CzStockItem } from "@/lib/cocozuri-stock-shared";

/** One material line as the sheet wrote it, before anything has been matched. */
export type CzImportedLine = {
  /** The row in the pasted block, 1-based, so a complaint can name it. */
  row: number;
  /** Exactly as typed — "Butter 150 gm", "Cooking Cream", "50% dark chocolate". */
  name: string;
  qty: number;
  /** The sheet's own unit for this line. Null when the block had no unit column. */
  uom: string | null;
};

export type CzImportedRecipe = {
  headerRow: number;
  /** The product name, as best it can be read. Null when nothing looked like one. */
  title: string | null;
  /** Read out of the title — "(M) 32 pcs", "(44PCS )", "Total 15 nos". */
  yieldQty: number | null;
  yieldUom: string;
  lines: CzImportedLine[];
  /** Everything left of the material column, kept so a person can see the
   *  block's own words rather than only what was made of them. */
  notes: string[];
  /** What the block could not supply. Shown, never worked around. */
  problems: string[];
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** A number the way a spreadsheet prints one. Shares the stock book's rules. */
function readNumber(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (s === "" || /^[-–—]$/.test(s)) return s === "" ? null : 0;
  const body = s.replace(/[,\s]/g, "").replace(/[–—]/g, "-");
  if (!/^-?\d*\.?\d+$/.test(body)) return null;
  const n = Number(body);
  return Number.isFinite(n) ? n : null;
}

/**
 * A left-hand cell that annotates rather than names.
 *
 * ⚠️ "One weight 120 gm" and "Total 8 nos" sit in the same column as the product
 * name and are NOT it. Taking the first non-empty cell filed three recipes under
 * "One weight 120 GM" when the audit was run that way.
 */
function isAnnotation(v: string): boolean {
  const t = v.trim();
  return /^(one|total|after|weigh|ingredients?|item no|used|price|gm|grm)\b/i.test(t)
    || /^\d/.test(t)
    || t.length < 3;
}

/** The yield written in a block's own words: "32 pcs", "(44PCS )", "Total 15 nos". */
export function readYield(texts: string[]): number | null {
  for (const t of texts) {
    const m = /(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|NO)\b/i.exec(t);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/**
 * Split a pasted block of the costing workbook into recipes.
 *
 * ⚠️ THE COLUMN LAYOUT IS DIFFERENT ON EVERY SHEET — the material sits in C on
 * REGULAR, B on TRIALS, B on Sheet2 — so the header row is FOUND and its columns
 * read off it. Nothing here assumes a position.
 */
export function parseRecipeSheet(text: string): CzImportedRecipe[] {
  const rows = String(text ?? "").split(/\r?\n/).map((l) => l.split("\t"));

  // Find every header row and the columns it labels.
  const heads: { row: number; item: number; used: number | null; unit: number | null }[] = [];
  rows.forEach((cells, r) => {
    const item = cells.findIndex((c) => norm(c) === "ITEM NO");
    if (item < 0) return;
    let used: number | null = null;
    let unit: number | null = null;
    cells.forEach((c, i) => {
      const t = norm(c);
      if (t === "USED") used = i;
      // ⚠️ The unit column is headed "GM" on every sheet, whatever it holds —
      // millilitres, pieces, bunches. It is a label, not a claim.
      else if (t === "GM" && used != null && i > used && unit == null) unit = i;
    });
    heads.push({ row: r, item, used, unit });
  });

  /* Where each block's materials stop, worked out for ALL of them first — the
     next block's text starts after this one's total, not at some fixed number
     of rows back from its header. */
  const totalRows = heads.map((h, i) => {
    const stop = i + 1 < heads.length ? heads[i + 1].row : rows.length;
    for (let r = h.row + 1; r < stop; r++) {
      if (norm(rows[r]?.[h.item]).startsWith("TOTAL COST")) return r;
    }
    return stop;
  });

  const out: CzImportedRecipe[] = [];
  heads.forEach((h, i) => {
    const stop = i + 1 < heads.length ? heads[i + 1].row : rows.length;
    const problems: string[] = [];
    const totalRow = totalRows[i]!;

    const lines: CzImportedLine[] = [];
    if (h.used == null) {
      problems.push("This block has no USED column, so no quantities can be read.");
    } else {
      for (let r = h.row + 1; r < totalRow; r++) {
        const cells = rows[r] ?? [];
        const name = String(cells[h.item] ?? "").replace(/\s+/g, " ").trim();
        if (name === "") continue;
        const qty = readNumber(String(cells[h.used] ?? ""));
        if (qty == null) { problems.push(`Row ${r + 1} "${name}" has no quantity — left out.`); continue; }
        if (qty <= 0) { problems.push(`Row ${r + 1} "${name}" asks for ${qty} — left out.`); continue; }
        const uom = h.unit != null ? String(cells[h.unit] ?? "").trim() || null : null;
        lines.push({ row: r + 1, name, qty, uom });
      }
    }

    /* Everything left of the material column, kept in TWO halves.
       ⚠️ ABOVE THE HEADER BEATS BELOW IT, AND THAT IS NOT A PREFERENCE — IT IS
       WHERE THE NAME IS. REGULAR writes the product in column B ON the header
       row; TRIALS writes it in column A there. Below the header, that same
       column holds the chef's own description of each material — "KITAIFI -
       96GMS(BAKED)" — so reading top to bottom without the split named the
       second recipe of a two-recipe paste after the first one's kunafa line.
       Only where nothing sits above (the first block of REGULAR, whose title is
       on the row under its header) does the half below get a say.
       ⚠️ And the start is the PREVIOUS BLOCK'S TOTAL, never a fixed number of
       rows back — blocks are not evenly spaced. */
    const collect = (from: number, to: number) => {
      const got: string[] = [];
      for (let r = Math.max(0, from); r <= Math.min(to, rows.length - 1); r++) {
        for (let c = 0; c < h.item; c++) {
          const v = String(rows[r]?.[c] ?? "").replace(/\s+/g, " ").trim();
          if (v !== "") got.push(v);
        }
      }
      return got;
    };
    const above = collect(i > 0 ? totalRows[i - 1]! + 1 : 0, h.row);
    const below = collect(h.row + 1, totalRow);
    const notes = [...above, ...below];

    const nameable = (v: string) => /[A-Za-z]{3}/.test(v) && !isAnnotation(v);
    const title = above.find(nameable) ?? below.find(nameable) ?? null;
    const yieldQty = readYield(notes);
    if (!title) problems.push("No product name could be read — type one.");
    if (yieldQty == null) problems.push("No yield is written in the block — type how many one batch makes.");
    if (lines.length === 0) problems.push("No materials could be read.");

    out.push({
      headerRow: h.row + 1, title, yieldQty, yieldUom: "PCS",
      lines, notes, problems,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * Placing a material against the shelf
 * ------------------------------------------------------------------ */

/**
 * A material name with its quantity stripped out.
 *
 * The chef writes the amount into the name — "Butter 150 gm", "Kunafa 20 gm" —
 * so the same material appears under dozens of names. Taking the amount off is
 * what makes them one name again. ⚠️ It is used to SUGGEST, never to match.
 */
export function stripIngredientQty(name: string): string {
  return normaliseItemName(String(name ?? "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:GMS?|GM|G|KGS?|KG|MLS?|ML|LTRS?|LTR|L|PCS?|NOS?|SHEETS?|BAGS?|TBSP|TSP|LEAF|CUPS?)\b/gi, " ")
    /* ⚠️ A NUMBER CARRYING A PER CENT SIGN IS PART OF THE NAME, NOT A QUANTITY.
       Stripping it turns "50% dark chocolate" into "% dark chocolate" and loses
       the difference between the 50%, the 70.5% and the 80% — three different
       materials at three different prices. Caught by a test, not by reading. */
    .replace(/\b\d+(?:\.\d+)?\b(?!\s*%)/g, " "));
}

export type CzMaterialSuggestion = {
  item: CzStockItem;
  /** `exact` — the shelf has this very name. `stripped` — it has the name once
   *  the quantity is taken off. `remembered` — a person said so earlier. */
  how: "exact" | "stripped" | "remembered";
};

/**
 * What this material probably is, on one location's shelf.
 *
 * ⚠️ A NAME BELONGS TO A LOCATION. `AMBER RABDI` is a different row in the
 * kitchen and the shop, so the search is always inside one location — the bug
 * that filed the first live recipe against the wrong shelf.
 *
 * ⚠️ IT RETURNS A SUGGESTION, NOT A DECISION. Two items sharing a name return
 * nothing at all rather than the first one found.
 */
export function suggestMaterial(
  name: string,
  items: CzStockItem[],
  locationId: number,
  remembered?: Record<string, number>,
): CzMaterialSuggestion | null {
  const pool = items.filter((i) => i.locationId === locationId && !i.archived);
  const rememberedId = remembered?.[stripIngredientQty(name)];
  if (rememberedId != null) {
    const it = pool.find((i) => i.id === rememberedId);
    if (it) return { item: it, how: "remembered" };
  }
  const exact = pool.filter((i) => normaliseItemName(i.name) === normaliseItemName(name));
  if (exact.length === 1) return { item: exact[0]!, how: "exact" };
  if (exact.length > 1) return null;
  const stripped = pool.filter((i) => normaliseItemName(i.name) === stripIngredientQty(name));
  if (stripped.length === 1) return { item: stripped[0]!, how: "stripped" };
  return null;
}

/** The same, for what the recipe MAKES — matched on the kitchen's own shelf. */
export function suggestOutput(
  title: string,
  items: CzStockItem[],
  locationId: number,
): CzMaterialSuggestion | null {
  const pool = items.filter((i) => i.locationId === locationId && !i.archived);
  const t = normaliseItemName(title);
  const exact = pool.filter((i) => normaliseItemName(i.name) === t);
  if (exact.length === 1) return { item: exact[0]!, how: "exact" };
  if (exact.length > 1) return null;
  /* The title carries its yield and its chocolate — "PISTACHIO KUNAFA BITES (M)
     32 pcs" — and the shelf does not. Taking those off is what lets the two
     meet; it is still only a suggestion. */
  const bare = normaliseItemName(t.replace(/\((?:M|D|W)\)/g, " ").replace(/\b\d+(?:\.\d+)?\s*(?:PCS|PC|NOS|NO)\b/g, " "));
  const stripped = pool.filter((i) => normaliseItemName(i.name) === bare);
  if (stripped.length === 1) return { item: stripped[0]!, how: "stripped" };
  return null;
}
