import { describe, it, expect } from "vitest";
import {
  parseRecipeSheet, readYield, stripIngredientQty, suggestMaterial, suggestOutput,
} from "./cocozuri-recipe-import";
import type { CzStockItem } from "./cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * Reading the chef's costing workbook.
 *
 * Every block below is copied out of `Item Costing Calculation (1).xlsx` — tabs
 * and all — because the point of this parser is that sheet, whose six pages put
 * the material column in three different places.
 * ------------------------------------------------------------------ */

const item = (id: number, name: string, locationId = 3, over: Partial<CzStockItem> = {}): CzStockItem => ({
  id, locationId, productId: null, name, uom: "GM", category: null,
  shelfLifeDays: null, sortOrder: id, archived: false, ...over,
});

/** REGULAR: the material sits in column C, so two columns come before it. */
const REGULAR = [
  "\t\tITEM NO\tUSED\tGM\tPRICE PER PACKING\t\t\t\tPRICE",
  "\tCREAM 300GMS\tCooking cream\t600\tGM\t1000\tML\t13,000\t\t7,800",
  "\tUNSALTED BUTTER 100GMS\tButter\t120\tGM\t1000\tGM\t28,000\t\t3,360",
  "\t\tTOTAL COST\t\t\t\t\t\t\t60,565",
  "\t\tCOST PER PCS\t\t\t\t\t\t\t1,892.65",
].join("\n");

/** TRIALS: the material sits in column B, and the title in column A. */
const TRIALS = [
  "Oatmeal Frame 26 pcs\tITEM NO\tUSED\tGM\tPRICE PER PACKING\t\t\tPRICE",
  "\tSugar 90gm\t90\tgm\t1000\tGM\t3,500\t315",
  "\tButter 20gm\t20\tgm\t1000\tGM\t28,000\t560",
  "\tTOTAL COST\t\t\t\t\t\t14,891",
].join("\n");

describe("splitting a pasted costing sheet", () => {
  it("finds the material column on REGULAR, where it is the third", () => {
    const [r] = parseRecipeSheet(`1\tSAFFRON & CARAMEL (M) 32 pcs\n${REGULAR}`);
    expect(r!.lines.map((l) => [l.name, l.qty, l.uom])).toEqual([
      ["Cooking cream", 600, "GM"],
      ["Butter", 120, "GM"],
    ]);
  });

  it("finds it on TRIALS, where it is the second", () => {
    const [r] = parseRecipeSheet(TRIALS);
    expect(r!.lines.map((l) => [l.name, l.qty])).toEqual([["Sugar 90gm", 90], ["Butter 20gm", 20]]);
  });

  it("stops at TOTAL COST, so no total is ever read as a material", () => {
    const [r] = parseRecipeSheet(TRIALS);
    expect(r!.lines.some((l) => /TOTAL/i.test(l.name))).toBe(false);
    expect(r!.lines).toHaveLength(2);
  });

  it("reads the product name and skips the weight annotations around it", () => {
    // ⚠️ "One weight 120 gm" and "Total 8 nos" sit in the same column as the
    // name and are not it.
    const [r] = parseRecipeSheet([
      "Cream brulle mixture\tITEM NO\tUSED\tGM\tPRICE PER PACKING\t\t\tPRICE",
      "Total 6 nos\tCooking Cream 240 gm\t240\tGM\t1\tgm\t13\t3,120",
      "One weight 120 gm\tCondensed milk 85 gm\t85\tGM\t1\tgm\t10\t850",
      "\tTOTAL COST\t\t\t\t\t\t9,784",
    ].join("\n"));
    expect(r!.title).toBe("Cream brulle mixture");
  });

  it("reads the yield out of the block's own words, however it is written", () => {
    expect(readYield(["SAFFRON & CARAMEL (M) 32 pcs"])).toBe(32);
    expect(readYield(["DARK CHOCOLATE ROCHER (44PCS )"])).toBe(44);
    expect(readYield(["Cream brulle mixture", "Total 6 nos"])).toBe(6);
    expect(readYield(["Oatmeal Frame 26 pcs"])).toBe(26);
  });

  it("says so rather than guessing when the yield is not written", () => {
    // REGULAR!R891 "Lemon & chilli" divides by 35 and says so nowhere.
    const [r] = parseRecipeSheet([
      "Lemon & chilli\tITEM NO\tUSED\tGM\t\t\t\tPRICE",
      "\tButter 10 gm\t10\tGM\t1\tGM\t28\t280",
      "\tTOTAL COST\t\t\t\t\t\t15,899",
    ].join("\n"));
    expect(r!.yieldQty).toBeNull();
    expect(r!.problems.join(" ")).toMatch(/yield/i);
  });

  it("does not name a recipe after the PREVIOUS one's ingredient description", () => {
    /* ⚠️ Found by walking the real screen, not by reading. REGULAR keeps the
       product name in column B on the header row and the chef's description of
       each material in that same column below it, so a second block read from
       too far up was named "KITAIFI - 96GMS(BAKED)" -- the first recipe's kunafa
       line. Both of these are copied out of the workbook verbatim. */
    const rs = parseRecipeSheet([
      "15	PISTACHIO KUNAFA BITES (M) 32 pcs	ITEM NO	USED	GM	PRICE PER PACKING				PRICE",
      "	PISTACHIO PASTE - 128GMS	Pistachio Paste	128	GM	5000	GM	404,213		10,348",
      "	KITAIFI - 96GMS(BAKED)	Kunafa	100	GM	500	GM	27,740		5,548",
      "		TOTAL COST							34,802",
      "",
      "17	HAZELNUT KUNAFA BITE (M) 32 pcs	ITEM NO	USED	GM	PRICE PER PACKING				PRICE",
      "	HAZELNUT PASTE - 128GMS	Hazelnut paste	128	GM	5000	GM	317,157		8,119",
      "		TOTAL COST							32,573",
    ].join("\n"));
    expect(rs.map((r) => r.title)).toEqual([
      "PISTACHIO KUNAFA BITES (M) 32 pcs",
      "HAZELNUT KUNAFA BITE (M) 32 pcs",
    ]);
    expect(rs.map((r) => r.yieldQty)).toEqual([32, 32]);
  });

  it("still finds a title written on the row BELOW the header", () => {
    // REGULAR's very first block is written that way.
    const [r] = parseRecipeSheet([
      "		ITEM NO	USED	GM	PRICE PER PACKING				PRICE",
      "1	SAFFRON & CARAMEL (M) 32 pcs								",
      "	CREAM 300GMS	Cooking cream	600	GM	1000	ML	13,000		7,800",
      "		TOTAL COST							60,565",
    ].join("\n"));
    expect(r!.title).toBe("SAFFRON & CARAMEL (M) 32 pcs");
    expect(r!.yieldQty).toBe(32);
  });


  it("splits several recipes out of one paste", () => {
    const rs = parseRecipeSheet(`${TRIALS}\n\n${TRIALS}`);
    expect(rs).toHaveLength(2);
  });

  it("reports a line with no quantity instead of importing a zero", () => {
    const [r] = parseRecipeSheet([
      "Thing 4 pcs\tITEM NO\tUSED\tGM\t\t\t\tPRICE",
      "\tButter\t\tGM\t1\tGM\t28\t",
      "\tSugar\t90\tgm\t1000\tGM\t3500\t315",
      "\tTOTAL COST\t\t\t\t\t\t315",
    ].join("\n"));
    expect(r!.lines.map((l) => l.name)).toEqual(["Sugar"]);
    expect(r!.problems.join(" ")).toMatch(/Butter/);
  });

  it("reports a block that has no USED column at all", () => {
    // REGULAR has 23 such blocks — a recipe written down but never costed.
    const [r] = parseRecipeSheet([
      "Long kunafa sticks 50 gm\tITEM NO\t\t\t\t\t\tPRICE",
      "\tMilk chocolate\t\t\t\t\t\t",
    ].join("\n"));
    expect(r!.lines).toHaveLength(0);
    expect(r!.problems.join(" ")).toMatch(/USED/);
  });

  it("carries nothing at all from the price columns", () => {
    const [r] = parseRecipeSheet(REGULAR);
    // ⚠️ The workbook prices one butter at 28 a gram and another at 82.34. None
    // of that comes in — a recipe costs itself from what was actually paid.
    expect(JSON.stringify(r!.lines)).not.toMatch(/13,?000|28,?000|7,?800/);
  });
});

describe("placing a material against a shelf", () => {
  const shelf = [
    item(1, "Butter"),
    item(2, "Cooking cream"),
    item(3, "White chocolate"),
    // the same name on ANOTHER shelf — never reachable from location 3
    item(9, "Butter", 2),
  ];

  it("takes the quantity out of a name the chef wrote it into", () => {
    expect(stripIngredientQty("Butter 150 gm")).toBe("BUTTER");
    expect(stripIngredientQty("Cooking Cream 240 gm")).toBe("COOKING CREAM");
    expect(stripIngredientQty("Puff pastry 4sheet")).toBe("PUFF PASTRY");
    expect(stripIngredientQty("50% dark chocolate 60 gm")).toBe("50% DARK CHOCOLATE");
  });

  it("matches on case and spacing, and calls it exact", () => {
    expect(suggestMaterial("cooking   cream", shelf, 3)).toMatchObject({ item: { id: 2 }, how: "exact" });
  });

  it("suggests — and SAYS it is a suggestion — once the quantity is stripped", () => {
    expect(suggestMaterial("Butter 150 gm", shelf, 3)).toMatchObject({ item: { id: 1 }, how: "stripped" });
  });

  it("never reaches on to another shelf", () => {
    // Butter exists on location 2 as well; asking about 3 must never return it.
    expect(suggestMaterial("Butter", shelf, 3)!.item.id).toBe(1);
    expect(suggestMaterial("Butter", shelf, 2)!.item.id).toBe(9);
  });

  it("returns nothing rather than choosing between two items of one name", () => {
    const twice = [...shelf, item(4, "Butter")];
    expect(suggestMaterial("Butter", twice, 3)).toBeNull();
  });

  it("returns nothing for a name the shelf does not have", () => {
    expect(suggestMaterial("Yuzu juice", shelf, 3)).toBeNull();
  });

  it("prefers what a person decided earlier over anything it works out itself", () => {
    // ⚠️ This is what makes 174 recipes possible: say once that the chef's
    // "Feuilletine" is the shelf's "Feuilletine/Royaltine" and every later
    // recipe knows.
    const got = suggestMaterial("Butter 150 gm", shelf, 3, { BUTTER: 3 });
    expect(got).toMatchObject({ item: { id: 3 }, how: "remembered" });
  });

  it("ignores a remembered choice that is no longer on the shelf", () => {
    expect(suggestMaterial("Butter 150 gm", shelf, 3, { BUTTER: 999 })).toMatchObject({ how: "stripped" });
  });
});

describe("placing what the recipe makes", () => {
  const kitchen = [item(10, "AMBER RABDI", 2), item(11, "PISTACHIO KUNAFA BITES", 2)];

  it("matches the title exactly where it can", () => {
    expect(suggestOutput("amber rabdi", kitchen, 2)).toMatchObject({ item: { id: 10 }, how: "exact" });
  });

  it("suggests once the yield and the chocolate are taken off the title", () => {
    // "PISTACHIO KUNAFA BITES (M) 32 pcs" is the workbook's own way of writing it
    expect(suggestOutput("PISTACHIO KUNAFA BITES (M) 32 pcs", kitchen, 2))
      .toMatchObject({ item: { id: 11 }, how: "stripped" });
  });

  it("returns nothing for a product the kitchen does not stock", () => {
    expect(suggestOutput("PROTEIN BARS", kitchen, 2)).toBeNull();
  });
});
