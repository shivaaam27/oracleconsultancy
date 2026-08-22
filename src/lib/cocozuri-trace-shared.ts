/**
 * CocoZuri, manufacturing Stage 9 — expiry, shelf life and traceability.
 * The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-trace.ts` IS SERVER-ONLY.
 *
 * ⚠️ THE OWNER CONFIRMED THIS STAGE IS REAL (22 Aug 2026): *"yes everything has
 * expiry and shelf life"*. The plan had called it "proposed rather than
 * assumed"; it is a requirement.
 *
 * This is the part that matters on the day something goes wrong. Somebody rings
 * up about a bar with a date on it, and the questions are always the same two:
 * **what went into it**, and **where did the rest of that batch go**.
 */

/* ------------------------------------------------------------------ *
 * When a thing goes off
 * ------------------------------------------------------------------ */

/**
 * The expiry of something made today.
 *
 * ⚠️ THE EARLIER OF TWO DATES, AND THAT IS THE WHOLE RULE: what the shelf life
 * allows, and the soonest-expiring thing that went into it. A bar made with
 * almonds that expire next week does not last six months, however long a bar
 * normally lasts — people get this wrong by hand, which is exactly why it
 * belongs in software.
 *
 * ⚠️ AND IT RETURNS NULL RATHER THAN GUESSING. No shelf life and no dated
 * ingredient means nobody has said when it goes off, and inventing a date would
 * put a number on a wrapper that nothing supports.
 */
export function expiryFor(
  madeOn: string | null,
  shelfLifeDays: number | null,
  ingredientExpiries: (string | null)[] = [],
): { date: string | null; from: "shelf life" | "an ingredient" | null } {
  const fromLife = madeOn && shelfLifeDays != null && shelfLifeDays > 0
    ? addDays(madeOn, Math.round(shelfLifeDays))
    : null;
  const dated = ingredientExpiries.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const earliestIngredient = dated.length ? dated.slice().sort()[0]! : null;

  if (fromLife && earliestIngredient) {
    return earliestIngredient < fromLife
      ? { date: earliestIngredient, from: "an ingredient" }
      : { date: fromLife, from: "shelf life" };
  }
  if (fromLife) return { date: fromLife, from: "shelf life" };
  if (earliestIngredient) return { date: earliestIngredient, from: "an ingredient" };
  return { date: null, from: null };
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const z = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
  return Math.round((z - a) / 86_400_000);
}

/* ------------------------------------------------------------------ *
 * What is going off
 * ------------------------------------------------------------------ */

export type CzExpiryState = "expired" | "critical" | "soon" | "fine" | "unknown";

/**
 * ⚠️ THE BANDS ARE A DEFAULT, NOT A FACT. Nobody has said what "too close to
 * sell" means for chocolate here, so 0 / 14 / 60 days are a starting point that
 * a screen can show and somebody can argue with. They are in one place so that
 * argument changes one line.
 */
export const EXPIRY_BANDS = { critical: 14, soon: 60 } as const;

export function expiryState(expiresOn: string | null, today: string): CzExpiryState {
  const days = daysUntil(expiresOn, today);
  if (days == null) return "unknown";
  if (days < 0) return "expired";
  if (days <= EXPIRY_BANDS.critical) return "critical";
  if (days <= EXPIRY_BANDS.soon) return "soon";
  return "fine";
}

export const EXPIRY_LABEL: Record<CzExpiryState, string> = {
  expired: "Past its date",
  critical: "Days left",
  soon: "Going off soon",
  fine: "Fine",
  unknown: "No date",
};

/* ------------------------------------------------------------------ *
 * FEFO — first expired, first out
 * ------------------------------------------------------------------ */

export type CzLot = {
  batchId: number;
  batchNo: string;
  itemId: number;
  expiresOn: string | null;
  /** What is still on the shelf out of this lot. */
  onHand: number;
  source: "production" | "purchase";
  madeOn: string | null;
};

/**
 * Which lots to take from, and how much of each.
 *
 * ⚠️ FIRST EXPIRED, FIRST OUT — not first in, first out. They are not the same
 * thing and food is the case where the difference bites: a bag bought later can
 * easily go off sooner, and taking the older one would leave the one that is
 * about to expire on the shelf until it does.
 *
 * ⚠️ A LOT WITH NO DATE GOES LAST, never first. "Nobody said when it expires" is
 * not the same as "it lasts for ever", but there is nothing to sort it by — so
 * it is used only once the dated stock is gone, and it is REPORTED.
 *
 * ⚠️ AND IT RETURNS A SHORTFALL RATHER THAN OVER-ALLOCATING. Asking for more
 * than the shelf holds is a real situation (somebody used stock nobody recorded);
 * quietly allocating it would invent lots that were never there.
 */
export function allocateFefo(lots: CzLot[], need: number): {
  picks: { lot: CzLot; qty: number }[];
  short: number;
  undated: number;
} {
  const ordered = lots
    .filter((l) => l.onHand > 0.0005)
    .slice()
    .sort((a, b) => {
      if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn) || a.batchId - b.batchId;
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return a.batchId - b.batchId;
    });

  const picks: { lot: CzLot; qty: number }[] = [];
  let left = round3(need);
  for (const lot of ordered) {
    if (left <= 0.0005) break;
    const take = Math.min(lot.onHand, left);
    picks.push({ lot, qty: round3(take) });
    left = round3(left - take);
  }
  return {
    picks,
    short: left > 0.0005 ? left : 0,
    undated: round3(picks.filter((p) => !p.lot.expiresOn).reduce((t, p) => t + p.qty, 0)),
  };
}

/* ------------------------------------------------------------------ *
 * Minimum shelf life on despatch
 * ------------------------------------------------------------------ */

/**
 * ⚠️ A DEFAULT NOBODY HAS AGREED. Supermarkets normally demand a minimum
 * proportion of shelf life left on delivery — two thirds is the common one — but
 * nobody here has said what CocoZuri's customers ask for. So this WARNS and
 * never refuses: a rule invented in code and enforced as if it were a contract
 * is worse than no rule.
 */
export const MIN_SHELF_LIFE_FRACTION = 2 / 3;

export function despatchWarning(
  lot: Pick<CzLot, "expiresOn" | "madeOn">,
  shelfLifeDays: number | null,
  today: string,
): string | null {
  const left = daysUntil(lot.expiresOn, today);
  if (left == null) return null;
  if (left < 0) return "It is past its date.";
  if (shelfLifeDays && shelfLifeDays > 0) {
    const wanted = Math.round(shelfLifeDays * MIN_SHELF_LIFE_FRACTION);
    if (left < wanted) {
      return `Only ${left} of its ${shelfLifeDays} days are left. Most supermarkets want about ${wanted}.`;
    }
    return null;
  }
  return left <= EXPIRY_BANDS.critical ? `Only ${left} day${left === 1 ? "" : "s"} left on it.` : null;
}

/* ------------------------------------------------------------------ *
 * The trace
 * ------------------------------------------------------------------ */

export type TraceStep = {
  kind: "made" | "bought" | "used" | "moved" | "sold" | "returned" | "thrown" | "counted";
  onDate: string;
  itemId: number;
  itemName: string;
  locationName: string | null;
  /** ⚠️ Signed, as the ledger holds it. */
  qty: number;
  voucher: string | null;
  note: string | null;
};

export type BatchTrace = {
  batchNo: string;
  itemName: string | null;
  madeOn: string | null;
  expiresOn: string | null;
  source: "production" | "purchase";
  /** ⚠️ BACKWARD — what went into it, and which lot each came from. */
  wentIn: TraceStep[];
  /** ⚠️ FORWARD — where it went afterwards. */
  wentOut: TraceStep[];
  madeQty: number;
  onHand: number;
};

/** Turn a movement reason into something a person reads. */
export function stepKind(reason: string, qty: number): TraceStep["kind"] {
  switch (reason) {
    case "produce": return "made";
    case "receipt": return "bought";
    case "consume": return "used";
    case "transfer": return "moved";
    case "sale": case "day_out": return "sold";
    case "return": return "returned";
    case "damage": return "thrown";
    case "count": return "counted";
    default: return qty > 0 ? "bought" : "sold";
  }
}

export const STEP_LABEL: Record<TraceStep["kind"], string> = {
  made: "Made",
  bought: "Bought in",
  used: "Used in the making",
  moved: "Moved",
  sold: "Sold",
  returned: "Came back",
  thrown: "Thrown away",
  counted: "Counted",
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
