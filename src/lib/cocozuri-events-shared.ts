/**
 * CocoZuri Stage E — what happened, when, and who did it. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-events.ts` IS SERVER-ONLY.
 *
 * ⚠️ A COMMENT IS AN EVENT, not a separate thing. One stream, in one order, on
 * one screen — a second table would mean merging two lists and keeping two
 * things in date order on every record page.
 */

export type CzSubjectType =
  | "batch" | "invoice" | "purchase" | "plan" | "counter_sale" | "transfer"
  | "return" | "payment" | "receipt" | "recipe" | "item" | "product"
  | "customer" | "supplier" | "stock" | "module";

export type CzEventKind =
  | "created" | "updated" | "issued" | "approved" | "posted" | "unposted"
  | "closed" | "reopened" | "cancelled" | "deleted" | "started" | "comment";

export type CzEvent = {
  id: number;
  subjectType: CzSubjectType;
  subjectId: number | null;
  /** ⚠️ Frozen on the event — it must still read after the record is deleted. */
  subjectRef: string | null;
  kind: CzEventKind;
  summary: string;
  detail: Record<string, unknown> | null;
  by: string;
  at: string;
};

export const CZ_SUBJECT_LABEL: Record<CzSubjectType, string> = {
  batch: "Batch",
  invoice: "Invoice",
  purchase: "Purchase",
  plan: "Plan",
  counter_sale: "Counter sale",
  transfer: "Transfer",
  return: "Return",
  payment: "Payment out",
  receipt: "Payment in",
  recipe: "Recipe",
  item: "Stock item",
  product: "Product",
  customer: "Customer",
  supplier: "Supplier",
  stock: "Stock",
  module: "CocoZuri",
};

export const CZ_EVENT_LABEL: Record<CzEventKind, string> = {
  created: "Created",
  updated: "Changed",
  issued: "Issued",
  approved: "Approved",
  posted: "Put in the books",
  unposted: "Taken out of the books",
  closed: "Closed",
  reopened: "Reopened",
  cancelled: "Cancelled",
  deleted: "Deleted",
  started: "Started",
  comment: "Note",
};

/**
 * ⚠️ THREE TONES, NOT TWELVE. A screen where everything is coloured is a screen
 * where nothing stands out. Only the two that undo something are marked, and a
 * note is marked because it is the one written by a person rather than by the
 * system.
 */
export function eventTone(kind: CzEventKind): "undo" | "note" | "plain" {
  if (kind === "cancelled" || kind === "deleted" || kind === "unposted" || kind === "reopened") return "undo";
  if (kind === "comment") return "note";
  return "plain";
}

/** Which route a subject's record lives at, so a day log can be clicked through. */
export function subjectHref(e: Pick<CzEvent, "subjectType" | "subjectRef" | "subjectId">): string | null {
  const ref = e.subjectRef;
  switch (e.subjectType) {
    case "batch": return ref ? `/cocozuri/batches/${encodeURIComponent(ref)}` : "/cocozuri/batches";
    case "invoice": return ref ? `/cocozuri/invoices/${encodeURIComponent(ref)}` : "/cocozuri/invoices";
    case "plan": return ref ? `/cocozuri/order/${encodeURIComponent(ref)}` : "/cocozuri/order";
    case "supplier": return e.subjectId ? `/cocozuri/suppliers/${e.subjectId}` : "/cocozuri/suppliers";
    /* ⚠️ Purchases and counter sales have NO record page, so they can only go
       to their list. Everything below them does, and lands on the record —
       which is where that subject's own timeline now lives. */
    case "purchase": return "/cocozuri/purchases";
    case "counter_sale": return "/cocozuri/counter";
    case "transfer": return ref ? `/cocozuri/transfers/${encodeURIComponent(ref)}` : "/cocozuri/transfers";
    case "return": return ref ? `/cocozuri/returns/${encodeURIComponent(ref)}` : "/cocozuri/returns";
    case "payment": return "/cocozuri/payments";
    case "receipt": return "/cocozuri/receipts";
    /* A recipe is routed by its ID, not its name — the frozen `subjectRef` here
       is what it was CALLED, which is exactly what a deleted one needs. */
    case "recipe": return e.subjectId ? `/cocozuri/recipes/${e.subjectId}` : "/cocozuri/recipes";
    case "item": return "/cocozuri/items";
    case "product": return "/cocozuri/products";
    case "customer": return "/cocozuri/customers";
    default: return null;
  }
}

/**
 * A day's events, newest first, grouped by the calendar day they happened on.
 *
 * ⚠️ GROUPED IN DAR ES SALAAM'S DAY, not UTC. Everything here is stamped
 * `timestamptz`, and anything before 3am would otherwise be filed under
 * yesterday — the same trap `todayInDar` exists for on the stock side.
 */
export function groupByDay(events: CzEvent[]): { day: string; events: CzEvent[] }[] {
  const out = new Map<string, CzEvent[]>();
  for (const e of events) {
    const day = darDay(e.at);
    const at = out.get(day);
    if (at) at.push(e); else out.set(day, [e]);
  }
  return [...out.entries()]
    .map(([day, list]) => ({ day, events: list }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** The calendar day a timestamp falls on in Dar es Salaam (UTC+3). */
export function darDay(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  return new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The clock time, for a row in a day's list. */
export function darTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/**
 * ⚠️ A COMMENT MUST SAY SOMETHING. An empty note is a row that adds nothing to a
 * timeline and cannot be deleted afterwards, because events are append-only.
 */
export function commentBlockers(body: string): string[] {
  const b = body.trim();
  if (!b) return ["Write something first."];
  if (b.length > 4000) return ["That is longer than a note should be. Put it in the record itself."];
  return [];
}
