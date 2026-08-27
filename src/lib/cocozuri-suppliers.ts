import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { deleteVerdict } from "@/lib/cocozuri-lists-shared";
import { landedLines, purchaseTotals, type CzPurchase } from "@/lib/cocozuri-buy-shared";
import { listPurchases } from "@/lib/cocozuri-buy";

/* ------------------------------------------------------------------ *
 * CocoZuri Stage B — who we buy from. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ THERE IS NO NEW TABLE AND THERE MUST NOT BE. Suppliers already exist as the
 * shared `vendors` register — a purchase points at one through
 * `cz_purchases.vendor_id`. The only thing wrong was that the register lives in
 * another module, so from inside CocoZuri it was invisible and in practice
 * nobody used it: purchases carry typed names instead.
 *
 * A second supplier list would be two lists to keep in step, and they would
 * drift within a month.
 *
 * ⚠️ AND THE SUPPLIER ON A PURCHASE STAYS OPTIONAL (the owner, 22 Aug 2026).
 * Raw materials are often bought at random or with somebody's own money, and a
 * form demanding a supplier record will not get filled in — a purchase nobody
 * records never reaches the books at all. "Not named" is a plain fact here,
 * never a warning.
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (v == null ? 0 : Number(v));
const round2p = (n: number) => Math.round(n * 100) / 100;

/* ⚠️ `purchaseTotals` and `landedLines` take the PARTS, not the purchase — so
   that a form can total what is being typed before anything is saved. These two
   adapters are the only place that unpacking happens here. */
const totalsOf = (p: CzPurchase) =>
  purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount);
const landedOf = (p: CzPurchase) =>
  landedLines(p.lines, p.vatRate, p.taxInclusive, p.freightAmount);

export type CzSupplier = {
  id: number;
  name: string;
  category: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  /** Every figure below is derived on read. Nothing is stored. */
  purchases: number;
  lastBoughtOn: string | null;
  spent: number;
  /** What is still owed to them — only credit and own-money purchases leave anything. */
  owed: number;
  /** How many different materials we buy from them. */
  materials: number;
};

/**
 * Everyone we buy from, with what they have supplied.
 *
 * ⚠️ ONLY APPROVED PURCHASES COUNT TOWARDS SPEND. A draft moves no stock and
 * posts nothing — that is what makes it safe to type while the delivery is still
 * coming through the door — so counting it as money spent would inflate every
 * supplier by whatever is sitting half-typed.
 */
export async function listSuppliers(): Promise<CzSupplier[]> {
  const company = await cocozuriCompany();
  if (!company) return [];

  const [{ data: vendorRows }, purchases] = await Promise.all([
    sb.from("vendors").select("id,name,category,contact_name,email,phone,active").order("name"),
    listPurchases(),
  ]);

  const byVendor = new Map<number, CzPurchase[]>();
  for (const p of purchases) {
    if (p.vendorId == null) continue;
    const at = byVendor.get(p.vendorId);
    if (at) at.push(p); else byVendor.set(p.vendorId, [p]);
  }

  return ((vendorRows ?? []) as Record<string, unknown>[])
    .map((v) => {
      const mine = byVendor.get(v.id as number) ?? [];
      const counted = mine.filter((p) => p.status === "approved");
      const items = new Set<number>();
      for (const p of counted) for (const l of p.lines) if (l.itemId) items.add(l.itemId);
      return {
        id: v.id as number,
        name: (v.name as string) ?? "",
        category: (v.category as string | null) ?? null,
        contactName: (v.contact_name as string | null) ?? null,
        email: (v.email as string | null) ?? null,
        phone: (v.phone as string | null) ?? null,
        active: (v.active as boolean) ?? true,
        purchases: mine.length,
        lastBoughtOn: counted.map((p) => p.purchasedOn).sort().at(-1) ?? null,
        spent: round2p(counted.reduce((t, p) => t + totalsOf(p).payable, 0)),
        /* ⚠️ ONLY `credit` IS OWED TO THE SUPPLIER. A purchase paid from the
           bank or the cash box was settled the day it was bought. And one
           bought with somebody's OWN MONEY is owed too — but to that PERSON,
           not to the supplier, so it must not appear here. */
        owed: round2p(counted
          .filter((p) => p.paidFrom === "credit")
          .reduce((t, p) => t + totalsOf(p).payable, 0)),
        materials: items.size,
      };
    })
    // ⚠️ Suppliers we actually buy from first — the register is shared with the
    // whole group, so most rows on it have nothing to do with chocolate.
    .sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
}

export type CzSupplierMaterial = {
  itemId: number;
  itemName: string;
  timesBought: number;
  lastOn: string | null;
  lastUnitCost: number | null;
  /** ⚠️ The LANDED cost, freight included — what it really cost on the shelf. */
  firstUnitCost: number | null;
  qty: number;
};

/**
 * What one supplier sells us, and what it has cost over time.
 *
 * ⚠️ THIS IS THE SCREEN THAT CATCHES THE CHEF'S WORKBOOK PROBLEM. 228 ingredient
 * names were priced at 50 different rates between them — butter at 28 a gram in
 * 82 lines and 82.34 in one. Nothing here can prevent that being typed, but
 * "what did we last pay, and has it moved" is the question that finds it.
 *
 * ⚠️ THE COST IS THE LANDED ONE, freight spread in — booking freight to carriage
 * makes the almonds look cheaper than they were and every batch costed from them
 * wrong the same way.
 */
export async function supplierMaterials(vendorId: number): Promise<CzSupplierMaterial[]> {
  const purchases = (await listPurchases()).filter(
    (p) => p.vendorId === vendorId && p.status === "approved",
  );
  const { data: itemRows } = await sb.from("cz_stock_items").select("id,name");
  const itemName = new Map(((itemRows ?? []) as Record<string, unknown>[])
    .map((i) => [i.id as number, (i.name as string) ?? ""]));

  const byItem = new Map<number, { on: string; unit: number | null; qty: number }[]>();
  for (const p of purchases) {
    const landed = landedOf(p);
    for (const l of landed) {
      if (!l.line.itemId) continue;
      const at = byItem.get(l.line.itemId) ?? [];
      at.push({ on: p.purchasedOn, unit: l.unitCost, qty: num(l.line.qty) });
      byItem.set(l.line.itemId, at);
    }
  }

  return [...byItem.entries()]
    .map(([itemId, buys]) => {
      const inOrder = buys.slice().sort((a, b) => a.on.localeCompare(b.on));
      const priced = inOrder.filter((b) => b.unit != null);
      return {
        itemId,
        itemName: itemName.get(itemId) ?? `Item #${itemId}`,
        timesBought: inOrder.length,
        lastOn: inOrder.at(-1)?.on ?? null,
        lastUnitCost: priced.at(-1)?.unit ?? null,
        firstUnitCost: priced[0]?.unit ?? null,
        qty: round2p(inOrder.reduce((t, b) => t + b.qty, 0)),
      };
    })
    .sort((a, b) => (b.lastOn ?? "").localeCompare(a.lastOn ?? "") || a.itemName.localeCompare(b.itemName));
}

/**
 * How the price of one material has moved, whoever sold it.
 *
 * ⚠️ ACROSS EVERY SUPPLIER, deliberately. "Has cocoa butter gone up" is a
 * question about the material, not about one seller, and answering it per
 * supplier would hide the case that matters most — the same thing bought dearer
 * somewhere else.
 */
export async function materialPriceHistory(itemId: number): Promise<{
  onDate: string; supplier: string | null; qty: number; unitCost: number | null; reference: string | null;
}[]> {
  const purchases = (await listPurchases()).filter((p) => p.status === "approved");
  const out: { onDate: string; supplier: string | null; qty: number; unitCost: number | null; reference: string | null }[] = [];
  for (const p of purchases) {
    for (const l of landedOf(p)) {
      if (l.line.itemId !== itemId) continue;
      out.push({
        onDate: p.purchasedOn,
        supplier: p.vendorName?.trim() || p.supplierName?.trim() || null,
        qty: num(l.line.qty),
        unitCost: l.unitCost,
        reference: p.reference,
      });
    }
  }
  return out.sort((a, b) => b.onDate.localeCompare(a.onDate));
}

/**
 * Approved purchases carrying a typed name and no supplier record.
 *
 * ⚠️ THIS IS NOT A FAULT LIST. The owner settled it: a supplier is optional
 * because raw materials are often bought at random or with somebody's own money,
 * and a form demanding a record simply would not get filled in — a purchase
 * nobody records never reaches the books at all.
 *
 * It is worth SAYING, though, because a typed name has no history behind it:
 * nothing to look back at when the question is what it cost last time.
 */
export async function unnamedSuppliers(): Promise<{ name: string; purchases: number }[]> {
  const purchases = (await listPurchases()).filter(
    (p) => p.status === "approved" && p.vendorId == null && (p.supplierName ?? "").trim(),
  );
  const tally = new Map<string, number>();
  for (const p of purchases) {
    const name = p.supplierName!.trim();
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, purchasesCount]) => ({ name, purchases: purchasesCount }))
    .sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
}

/** One supplier, for their own page. */
export async function getSupplier(id: number): Promise<CzSupplier | null> {
  return (await listSuppliers()).find((s) => s.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * Adding one from inside CocoZuri
 *
 * ⚠️ IT WRITES TO THE SHARED `vendors` REGISTER, exactly as Assets & Vendors
 * does. There is still ONE list — this is only a second door onto it.
 *
 * ⚠️ AND THE DOOR IS NEEDED, which the data settled. The register was found
 * EMPTY across the whole system: not one vendor row anywhere, while every
 * CocoZuri purchase carried a typed name. Telling somebody to go to another
 * module to add a supplier is exactly why nobody ever had.
 * ------------------------------------------------------------------ */

export type CzSupplierInput = {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export async function saveSupplier(
  id: number | null, input: CzSupplierInput,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A supplier needs a name." };

  const company = await cocozuriCompany();
  const { createVendor, updateVendor } = await import("@/lib/vendors");
  const payload = {
    name,
    /* ⚠️ "Supplier" is the register's own word for this category — the list is
       shared with contractors, landlords and utilities, and a CocoZuri supplier
       arriving uncategorised would be indistinguishable from a landlord. */
    category: "Supplier",
    // Whose vendor it primarily is. Optional on the register; here it is known.
    companyId: company?.id ?? null,
    contactName: input.contactName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    location: null,
    notes: input.notes?.trim() || null,
  };

  try {
    if (id) { await updateVendor(id, payload); return { ok: true, id }; }
    return { ok: true, id: await createVendor(payload) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That did not save." };
  }
}

/**
 * Take a supplier off the register.
 *
 * ⚠️ REFUSED WHILE A PURCHASE NAMES THEM, and it says how many. A purchase is a
 * document that was acted on — stock moved and the books were posted — and it
 * cannot lose the supplier it names.
 */
export async function deleteSupplier(id: number): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ PURCHASES ARE NOT THE ONLY THING THAT POINTS AT A SUPPLIER. `documents`
     and `assets` both carry a `vendor_id`, and both are ON DELETE **SET NULL** —
     so deleting a supplier would not fail, it would quietly detach their signed
     contract and every piece of equipment bought from them. A silent detach is
     worse than a refusal: nothing tells anybody it happened.

     ⚠️ ALL THREE BLOCK. A purchase was acted on; a contract is a document
     somebody signed; an asset is a real thing on somebody's desk. Taking them
     out of USE is the answer for a supplier you have finished with. */
  const [purchases, documents, assets] = await Promise.all([
    sb.from("cz_purchases").select("*", { count: "exact", head: true }).eq("vendor_id", id),
    sb.from("documents").select("*", { count: "exact", head: true }).eq("vendor_id", id),
    sb.from("assets").select("*", { count: "exact", head: true }).eq("vendor_id", id),
  ]);
  const verdict = deleteVerdict([
    { what: "purchase", count: purchases.count ?? 0, blocking: true },
    { what: "document", count: documents.count ?? 0, blocking: true },
    { what: "asset", count: assets.count ?? 0, blocking: true },
  ]);
  if (!verdict.ok) {
    return { ok: false, error: `${verdict.reason} Take them out of use instead — the history stays.` };
  }
  const { error } = await sb.from("vendors").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Take them out of use without losing them. */
export async function setSupplierActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("vendors")
    .update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
