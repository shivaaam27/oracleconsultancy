/**
 * CocoZuri Stage A — what kind of thing an item is, and the lists you pick from.
 * The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-lists.ts` IS SERVER-ONLY.
 */

/* ------------------------------------------------------------------ *
 * What kind of thing a stock item is
 * ------------------------------------------------------------------ */

export type CzItemKind = "raw_material" | "packaging" | "finished" | "other";

/**
 * ⚠️ NULL IS A FIFTH STATE AND IT IS NOT "OTHER". "Nobody has said" and "it is
 * none of these" are different answers: the first is a job somebody has to do,
 * the second is a decision somebody made. Collapsing them would hide the job.
 */
export const CZ_ITEM_KINDS: { key: CzItemKind; label: string; hint: string }[] = [
  { key: "raw_material", label: "Raw material", hint: "Goes into a recipe — cocoa, cream, nuts, coffee." },
  { key: "packaging", label: "Packaging", hint: "Holds the chocolate — boxes, wrappers, trays, ribbon." },
  { key: "finished", label: "Finished good", hint: "Something you sell. Linked to a product." },
  { key: "other", label: "Something else", hint: "Bought and counted, but neither made from nor sold — cleaning, gas, spares." },
];

export function itemKindLabel(kind: string | null | undefined): string {
  if (!kind) return "not said";
  return CZ_ITEM_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

/**
 * What a recipe line of a given sort should be offered.
 *
 * ⚠️ IT NEVER RETURNS AN EMPTY-HANDED "SHOW NOTHING". An item nobody has
 * classified is still offered — sorted last and flagged — because hiding it
 * would make the gap invisible and block real work on a row whose only fault is
 * that nobody has got to it yet. The filter narrows, it does not gatekeep.
 */
export function kindsForRecipeLine(lineKind: "ingredient" | "packaging" | "finishing"): CzItemKind[] {
  switch (lineKind) {
    case "packaging": return ["packaging"];
    // ⚠️ "Finishing" is the owner's own word and nobody has said what it covers
    // (plan §5a), so it is not narrowed to one kind — a finishing touch could be
    // a material or a wrapper, and guessing would be inventing his meaning.
    case "finishing": return ["raw_material", "packaging", "other"];
    default: return ["raw_material", "other"];
  }
}

/** Sort so the likely answers come first and the unclassified go last, not away. */
export function byKindRelevance<T extends { kind?: string | null; name: string }>(
  wanted: CzItemKind[],
): (a: T, b: T) => number {
  const rank = (k: string | null | undefined) => {
    if (k && wanted.includes(k as CzItemKind)) return 0;
    if (!k) return 1;            // nobody has said — still offered, in the middle
    return 2;                     // classified as something else — last
  };
  return (a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name);
}

/* ------------------------------------------------------------------ *
 * The lists you pick from
 * ------------------------------------------------------------------ */

export type CzListKind = "category" | "brand" | "uom" | "pack_unit";

export const CZ_LIST_KINDS: { key: CzListKind; label: string; one: string; hint: string }[] = [
  { key: "category", label: "Categories", one: "category", hint: "How products are grouped — bars, bonbons, cookies." },
  { key: "brand", label: "Brands", one: "brand", hint: "Whose name is on it." },
  { key: "uom", label: "Count units", one: "count unit", hint: "What you count it in — PCS, GM, KG." },
  { key: "pack_unit", label: "Pack units", one: "pack unit", hint: "What a pack is measured in — GM in a 100GM bar." },
];

export function listKindLabel(kind: CzListKind): string {
  return CZ_LIST_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

export type CzListValue = {
  id: number;
  kind: CzListKind;
  value: string;
  sortOrder: number;
  archived: boolean;
  /** How many products and items use it. Derived on read, never stored. */
  usedBy: number;
};

/**
 * Whether a value can be added.
 *
 * ⚠️ THE CHECK IS CASE-INSENSITIVE, and that is the whole reason this list
 * exists. `PCS` and `Pcs` being two entries is the fault it ends — five count
 * units were found in a catalogue that has three.
 */
export function listBlockers(
  value: string, existing: { value: string; id?: number }[], selfId?: number,
): string[] {
  const v = value.trim();
  if (!v) return ["It needs a name."];
  if (v.length > 60) return ["That is too long for a list entry."];
  const clash = existing.find(
    (e) => e.value.trim().toLowerCase() === v.toLowerCase() && e.id !== selfId,
  );
  if (clash) return [`${clash.value} is already on the list. Merge into it rather than adding it twice.`];
  return [];
}

/**
 * Values that look like the same thing typed differently.
 *
 * ⚠️ IT SUGGESTS, IT NEVER MERGES. Whether `GM` and `GRM` are one unit is a
 * business decision, not a string comparison — the same reason the product
 * duplicates were imported deliberately rather than collapsed on the way in.
 */
export function likelyDuplicates(values: { id: number; value: string }[]): {
  a: { id: number; value: string }; b: { id: number; value: string };
}[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  // Drop a trailing plural, so PKT and PKTS are the same word.
  const stem = (s: string) => norm(s).replace(/s$/, "");

  /* ⚠️ ONE BEING AN ABBREVIATION OF THE OTHER is the shape these actually
     take: GM and GRM, GM and GRAM, PKT and PACKET. Stripping vowels does not
     catch them — neither GM nor GRM has one — so the test is whether the shorter
     reads through the longer in order. Kept to a difference of two letters, or
     it would start pairing words that merely share a few letters. */
  const abbreviates = (short: string, long: string) => {
    if (short.length < 2 || long.length - short.length > 2) return false;
    let i = 0;
    for (const ch of long) if (ch === short[i]) i++;
    return i === short.length;
  };

  const out: { a: { id: number; value: string }; b: { id: number; value: string } }[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i]!, b = values[j]!;
      const sa = stem(a.value), sb = stem(b.value);
      if (!sa || !sb) continue;
      const pair = sa === sb
        || (sa.length <= sb.length ? abbreviates(sa, sb) : abbreviates(sb, sa));
      if (pair) out.push({ a, b });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * What points at a record
 * ------------------------------------------------------------------ */

export type CzUsage = { what: string; count: number; blocking: boolean };

/**
 * Whether a record can be removed, and what to say if not.
 *
 * ⚠️ THE RULE, AND IT IS ERPNEXT'S OWN: a draft goes; something acted on is
 * cancelled first and then goes; and anything still pointed at names what points
 * at it rather than failing with a database error nobody can read.
 *
 * ⚠️ NOT EVERYTHING THAT POINTS AT A RECORD BLOCKS IT. A price can go with the
 * product it prices; an invoice cannot, because somebody was sent it.
 */
export function deleteVerdict(usage: CzUsage[]): { ok: boolean; reason: string | null } {
  const blocking = usage.filter((u) => u.blocking && u.count > 0);
  if (blocking.length === 0) return { ok: true, reason: null };
  const list = blocking
    .map((u) => `${u.count} ${u.what}${u.count === 1 ? "" : "s"}`)
    .join(", ");
  return {
    ok: false,
    reason: `This is used by ${list}. Deleting it would leave those pointing at nothing — deal with them first, or archive this instead.`,
  };
}

/** What deleting will also remove, said plainly before it happens. */
export function alsoRemoved(usage: CzUsage[]): string | null {
  const going = usage.filter((u) => !u.blocking && u.count > 0);
  if (going.length === 0) return null;
  return going.map((u) => `${u.count} ${u.what}${u.count === 1 ? "" : "s"}`).join(", ");
}
