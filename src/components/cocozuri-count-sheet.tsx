"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, ClipboardPaste, Loader2, Plus } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import {
  ledgerBalanceAt, matchCountRows, parseCountPaste, qty,
  type CzCountMatchProblem, type CzStockCount, type CzStockItem, type CzStockLocation,
  type CzStockMove,
} from "@/lib/cocozuri-stock-shared";
import { createStockItemAction, recordStockCountsAction } from "@/app/cocozuri/actions";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Counting the whole shelf at once.
 *
 * The kitchen counts 75 lines and raw materials 171, and they arrive as a
 * spreadsheet column headed CL STOCK. Typing that one bottom-sheet at a time is
 * how a stock-take stops happening, so the sheet is pasted in whole.
 *
 * ⚠️ NOTHING IS CREATED AND NOTHING IS GUESSED. A name that is not already on
 * this shelf is REPORTED, never turned into a new item — matching stock by name
 * is fault #4, and the answer to it is not a cleverer match. A heading pasted
 * along with the rows is reported too, so nobody has to wonder whether BONBONS
 * was counted.
 *
 * ⚠️ A NEGATIVE FIGURE IS REFUSED. A closing balance of −11 is the book being
 * wrong, which is precisely what the stock-take is for; saving it as a count
 * would make the arithmetic error the new truth and carry it forward for ever.
 * ------------------------------------------------------------------ */

const PROBLEM_LABEL: Record<CzCountMatchProblem["kind"], string> = {
  unknown: "Not on this shelf",
  ambiguous: "Two items share this name",
  "no-figure": "No figure — a heading, or a blank cell",
  repeated: "The same item twice",
  negative: "A shelf cannot hold less than nothing",
};

const PROBLEM_HELP: Record<CzCountMatchProblem["kind"], string> = {
  unknown: "A category heading pasted with the rows lands here — leave those alone. For a real item, correct the spelling or put it on the shelf yourself, one at a time. Nothing is created for you.",
  ambiguous: "Count these two by hand so the right row gets the figure.",
  "no-figure": "Nobody counted these. A blank is not a zero, so they are left alone.",
  repeated: "The first figure was taken. Remove the duplicate if it was the later one you meant.",
  negative: "The book is wrong, not the shelf. Count it again, or record 0 and say where the rest went.",
};

export function CocozuriCountSheet({
  location, items, counts, moves, countedOn, onClose, onSaved, onAdded, toast, nameOf,
}: {
  location: CzStockLocation;
  items: CzStockItem[];
  counts: CzStockCount[];
  moves: CzStockMove[];
  countedOn: string;
  onClose: () => void;
  onSaved: () => void;
  /** Re-read the shelf after an item was put on it, WITHOUT closing the sheet —
   *  the paste is still in the box and re-places itself against the new list. */
  onAdded: () => void;
  toast: (m: string, o?: { tone?: "success" | "danger" }) => void;
  nameOf: (i: CzStockItem) => string;
}) {
  const [text, setText] = useState("");
  const [on, setOn] = useState(countedOn);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  /** What most of this shelf is measured in — the kitchen counts in pieces, raw
   *  materials in grams. A guess worth making, and shown before it is used. */
  const defaultUom = useMemo(() => {
    const tally = new Map<string, number>();
    for (const i of items) if (i.locationId === location.id) tally.set(i.uom, (tally.get(i.uom) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PCS";
  }, [items, location.id]);

  async function addToShelf(name: string) {
    setAdding(name);
    const res = await createStockItemAction({ locationId: location.id, name, uom: defaultUom, productId: null });
    setAdding(null);
    if (!res.ok) { toast(res.error ?? "Could not add it.", { tone: "danger" }); return; }
    toast(`${name} is on ${location.name} now, and the paste has placed it.`, { tone: "success" });
    onAdded();
  }

  const { matched, problems } = useMemo(
    () => matchCountRows(parseCountPaste(text), items, location.id),
    [text, items, location.id],
  );

  /* ⚠️ THE BOOK IS READ AT THE COUNT'S OWN DATE, and the count being judged is
     not in it — the same rule `varianceOf` keeps server-side. Change the date
     and every variance on screen moves with it, which is the honest behaviour:
     a count is the position at the END of its date. */
  const rows = useMemo(() => matched.map((m) => {
    const earlier = counts.filter((c) => !(c.itemId === m.item.id && c.countedOn === on));
    const book = ledgerBalanceAt(m.item.id, location.id, moves, earlier, on).closing;
    return { ...m, book, variance: m.qty - book };
  }), [matched, counts, moves, location.id, on]);

  const varying = rows.filter((r) => Math.abs(r.variance) > 0.0005);
  const needsReason = varying.length > 0;
  const byKind = useMemo(() => {
    const m = new Map<CzCountMatchProblem["kind"], CzCountMatchProblem[]>();
    for (const p of problems) m.set(p.kind, [...(m.get(p.kind) ?? []), p]);
    return [...m.entries()];
  }, [problems]);

  async function save() {
    if (rows.length === 0) { toast("Paste the count first.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await recordStockCountsAction({
      countedOn: on,
      rows: rows.map((r) => ({ itemId: r.item.id, qty: r.qty })),
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save the count.", { tone: "danger" }); return; }
    toast(
      `${res.saved} counted — ${res.agreed} agreed with the book, ${res.explained} did not.`,
      { tone: "success" },
    );
    onSaved();
  }

  return (
    <BottomSheet open onClose={onClose} title={`Count the whole of ${location.name}`} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Counted as at the end of</span>
            <input type="date" value={on} onChange={(e) => e.target.value && setOn(e.target.value)}
              className="h-8 rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-accent" />
          </label>
          <p className="max-w-md text-xs leading-relaxed text-fg-subtle">
            A count is the position at the <strong>end</strong> of its date, and it becomes the new truth — everything
            after it carries forward from what was counted.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            Paste the sheet — the name column and the figure column
          </span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={text ? 4 : 7} spellCheck={false}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs leading-relaxed text-fg outline-none focus:border-accent"
            placeholder={"AMBER RABDI\t111\nFRESH MINT\t51\nPISTACHIO KUNAFA BITES\t305"} />
          <span className="text-xs text-fg-subtle">
            Copy both columns straight out of Excel. Headings and blank rows are ignored and listed below, never counted.
          </span>
        </label>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="rounded-md border border-border bg-bg-subtle px-2 py-0.5 text-fg">
              <strong>{rows.length}</strong> placed
            </span>
            <span className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-success">
              {rows.length - varying.length} agree with the book
            </span>
            {varying.length > 0 && (
              <span className="rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-warn">
                {varying.length} differ
              </span>
            )}
            {problems.length > 0 && (
              <span className="rounded-md border border-border bg-bg-subtle px-2 py-0.5 text-fg-muted">
                {problems.length} not counted
              </span>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              <span>Item</span>
              <span className="text-right">Book says</span>
              <span className="text-right">Counted</span>
              <span className="text-right">Variance</span>
            </div>
            <div className="max-h-[18rem] overflow-y-auto">
              {rows.map((r) => (
                <div key={r.item.id}
                  className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] items-center gap-2 border-b border-border px-3 py-1 last:border-0">
                  <span className="min-w-0 truncate text-sm text-fg" title={nameOf(r.item)}>
                    {nameOf(r.item)}
                    <span className="ml-1.5 text-xs text-fg-subtle">{r.item.uom}</span>
                  </span>
                  <span className="text-right text-sm tabular text-fg-muted">{qty(r.book)}</span>
                  <span className="text-right text-sm tabular text-fg">{qty(r.qty)}</span>
                  <span className={cn("text-right text-sm tabular",
                    Math.abs(r.variance) < 0.0005 ? "text-success" : r.variance < 0 ? "text-danger" : "text-warn")}>
                    {Math.abs(r.variance) < 0.0005 ? "0" : r.variance > 0 ? `+${qty(r.variance)}` : qty(r.variance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ⚠️ WHAT WAS NOT COUNTED IS SAID OUT LOUD. A paste that silently drops
            eleven lines is how somebody believes a shelf was counted when it
            was not — the same fault as a total that quietly leaves things out. */}
        {byKind.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
            {byKind.map(([kind, list]) => (
              <div key={kind}>
                <p className="text-sm font-medium text-fg">
                  {PROBLEM_LABEL[kind]} <span className="text-fg-subtle">· {list.length}</span>
                </p>
                <p className="text-xs leading-relaxed text-fg-subtle">{PROBLEM_HELP[kind]}</p>
                {/* ⚠️ AN UNKNOWN NAME IS PUT ON THE SHELF ONE AT A TIME, BY HAND.
                    A button somebody presses per line is not the thing the
                    import script refuses to do — that is a name match quietly
                    creating rows nobody looked at. Each of these is looked at. */}
                {kind === "unknown" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {list.map((p) => (
                      <button key={p.line.lineNo} type="button" disabled={adding === p.line.name}
                        onClick={() => void addToShelf(p.line.name)}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        title={`Put "${p.line.name}" on ${location.name}`}>
                        {adding === p.line.name ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        {p.line.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    {list.slice(0, 12).map((p) => `line ${p.line.lineNo}: ${p.line.name}`).join(" · ")}
                    {list.length > 12 && ` · and ${list.length - 12} more`}
                  </p>
                )}
                {kind === "unknown" && (
                  <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                    A new item arrives <strong>not linked to a product</strong>, so what goes out of it cannot be valued
                    until somebody links it. Its unit is {defaultUom}, the one most of this shelf uses.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ⚠️ ONE REASON MAY COVER THE WHOLE TAKE, and that is not a loophole.
            When the book has not been written up for a week every line varies,
            and demanding 246 typed sentences produces no stock-take at all. */}
        {needsReason && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              Why the count differs from the book <span className="text-warn">— required</span>
            </span>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
              placeholder="Month-end physical count; the day sheets stop on the 18th" />
            <span className="text-xs leading-relaxed text-fg-subtle">
              It is written against every line that differs. A count that finds a difference and says nothing is a
              number nobody can act on.
            </span>
          </label>
        )}

        {varying.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>
              <strong>{varying.length}</strong> of these will become the new truth in place of what the book says.
              Everything after {on} carries forward from the counted figure.
            </span>
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()}
            disabled={busy || rows.length === 0 || (needsReason && !reason.trim())}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}
            Save {rows.length > 0 ? `${rows.length} counts` : "the count"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          {rows.length === 0 && text.trim() !== "" && (
            <span className="inline-flex items-center gap-1.5 text-sm text-fg-subtle">
              <ClipboardPaste size={13} /> Nothing in that paste matches {location.name}.
            </span>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
